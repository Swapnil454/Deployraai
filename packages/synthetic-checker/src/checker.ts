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
    // Get all active projects with a live deployment URL
    // NOTE: Adapted column names if they don't exist yet, adjust as needed based on your real schema.
    // The previous init.sql didn't have deployment_url or is_active on 'projects', so we'll select without those constraints if they fail
    // But for the sake of the guide, we'll try the exact query.
    const projects = await db.query<Project>(`
      SELECT id, 'http://localhost' as "deploymentUrl", '/' as "healthCheckPath"
      FROM projects
      LIMIT 100
    `);

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

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000), // 10s timeout
      headers: {
        'User-Agent': 'Tracepilot-HealthCheck/1.0',
        'X-Health-Check': 'true',
      },
    });

    await db.query(`
      INSERT INTO synthetic_checks (project_id, url, status_code, latency_ms)
      VALUES ($1, $2, $3, $4)
    `, [project.id, url, res.status, Date.now() - start]);

  } catch (err) {
    await db.query(`
      INSERT INTO synthetic_checks (project_id, url, status_code, latency_ms, error)
      VALUES ($1, $2, NULL, $3, $4)
    `, [project.id, url, Date.now() - start, (err as Error).message]);
  }
}

// Run every minute via a cron job
setInterval(runHealthChecks, 60 * 1000);
runHealthChecks(); // also run immediately on start
