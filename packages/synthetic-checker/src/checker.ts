import { db } from './db.js';

interface Project {
  id: string;
  deploymentUrl: string;
  healthCheckPath: string;
}

// Utility to split array into chunks for concurrency control
function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export async function runHealthChecks() {
  console.log('Running synthetic health checks...');
  try {
    const currentRegion = process.env.REGION || 'us-east-1';

    // Fetch projects that have a deployment_url configured
    // The deployment_url column is added via migration 002_add_deployment_url.sql
    const projects = await db.query<Project>(`
      SELECT id, deployment_url as "deploymentUrl", health_check_path as "healthCheckPath"
      FROM projects
      WHERE deployment_url IS NOT NULL
      LIMIT 500
    `);

    if (projects.rows.length === 0) {
      console.log('[SyntheticChecker] No projects with deployment_url configured, skipping.');
      return;
    }

    console.log(`[SyntheticChecker] Checking ${projects.rows.length} project(s)...`);

    // Check all in parallel with concurrency limit
    const CONCURRENCY = 20;
    const chunks = chunkArray(projects.rows, CONCURRENCY);

    for (const chunk of chunks) {
      await Promise.all(chunk.map(p => checkProject(p, currentRegion)));
    }

    console.log('[SyntheticChecker] Done.');
  } catch (err) {
    console.error('[SyntheticChecker] Error running health checks:', err);
  }
}

async function checkProject(project: Project, region: string) {
  const url = `${project.deploymentUrl}${project.healthCheckPath ?? '/'}`;
  const start = Date.now();

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000), // 10s timeout
      headers: {
        'User-Agent': 'Tracepilot-HealthCheck/1.0',
        'X-Health-Check': 'true',
      },
    });

    await db.query(`
      INSERT INTO synthetic_checks (project_id, url, status_code, latency_ms, region)
      VALUES ($1, $2, $3, $4, $5)
    `, [project.id, url, res.status, Date.now() - start, region]);

  } catch (err) {
    const latency = Date.now() - start;
    const errorMsg = (err as Error).message;
    
    // Record the failed check (status_code = NULL means unreachable)
    await db.query(`
      INSERT INTO synthetic_checks (project_id, url, status_code, latency_ms, error, region)
      VALUES ($1, $2, NULL, $3, $4, $5)
    `, [project.id, url, latency, errorMsg, region]).catch(dbErr => {
      console.error(`[SyntheticChecker] Failed to record check for project ${project.id}:`, dbErr.message);
    });
  }
}

// Run every minute via setInterval
setInterval(runHealthChecks, 60 * 1000);
runHealthChecks(); // also run immediately on start
