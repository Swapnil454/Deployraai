import { db } from './db.js';

interface Project {
  id: string;
  deploymentUrl: string;
  healthCheckPath: string; // defaults to '/'
}

// Utility to split array into chunks
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
    // Get all active projects with a live deployment URL that should be checked by this region
    // NOTE: Adapted column names if they don't exist yet, adjust as needed based on your real schema.
    const currentRegion = process.env.REGION || 'us-east-1';
    const projects = await db.query<Project>(`
      SELECT id, 'http://localhost' as "deploymentUrl", '/' as "healthCheckPath"
      FROM projects
      WHERE (preferred_region = $1 OR check_all_regions = true)
      LIMIT 100
    `, [currentRegion]);

    // Check all in parallel with concurrency limit
    const CONCURRENCY = 20;
    const chunks = chunkArray(projects.rows, CONCURRENCY);

    for (const chunk of chunks) {
      await Promise.all(chunk.map(checkProject));
    }
  } catch (err) {
    console.error('Error running health checks (you may need to add deployment_url to your projects table):', err);
  }
}

async function checkProject(project: Project) {
  const url = `${project.deploymentUrl}${project.healthCheckPath ?? '/'}`;
  const start = Date.now();
  const region = process.env.CHECKER_REGION ?? 'us-east-1';

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
    await db.query(`
      INSERT INTO synthetic_checks (project_id, url, status_code, latency_ms, error, region)
      VALUES ($1, $2, NULL, $3, $4, $5)
    `, [project.id, url, Date.now() - start, (err as Error).message, region]);
  }
}

// Run every minute via a cron job
setInterval(runHealthChecks, 60 * 1000);
runHealthChecks(); // also run immediately on start
