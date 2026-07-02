import { db } from './db.js';
import dns from 'dns/promises';

function isPrivateIPv4(ip: string) {
  const parts = ip.split('.').map(Number);
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

function isBlockedHostname(hostname: string) {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0';
}

async function validateUrlSafe(rawUrl: string): Promise<string> {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP/HTTPS allowed');
  if (isBlockedHostname(url.hostname)) throw new Error('Localhost not allowed');

  const records = await dns.lookup(url.hostname, { all: true });
  if (records.length === 0) throw new Error('Could not resolve hostname');

  let safeIp: string | null = null;
  for (const record of records) {
    if (record.family === 4) {
      if (isPrivateIPv4(record.address)) throw new Error('Private IP not allowed');
      if (!safeIp) safeIp = record.address;
    }
    if (record.family === 6) {
      const ip = record.address.toLowerCase();
      // Block common IPv6 local/private ranges
      if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) {
        throw new Error('Private IPv6 not allowed');
      }
      // Block IPv4-mapped IPv6 addresses entirely to prevent SSRF bypasses via ::ffff:127.0.0.1
      if (ip.startsWith('::ffff:')) {
        throw new Error('IPv4-mapped IPv6 addresses are not allowed');
      }
      if (!safeIp) safeIp = `[${record.address}]`;
    }
  }
  if (!safeIp) throw new Error('No valid public IP found');
  return safeIp;
}

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

let isSyncing = false;

export async function runHealthChecks() {
  if (isSyncing) {
    console.log('[SyntheticChecker] Previous check still running, skipping this interval.');
    return;
  }
  isSyncing = true;
  console.log('Running synthetic health checks...');
  try {
    const currentRegion = process.env.REGION || 'us-east-1';

    let hasMore = true;
    let lastId = '00000000-0000-0000-0000-000000000000'; // Initial UUID

    while (hasMore) {
      // Fetch projects using cursor pagination
      const projects = await db.query<Project>(`
        SELECT id, deployment_url as "deploymentUrl", health_check_path as "healthCheckPath"
        FROM projects
        WHERE deployment_url IS NOT NULL AND id > $1
        ORDER BY id ASC
        LIMIT 500
      `, [lastId]);

      if (projects.rows.length === 0) {
        break; // No more projects
      }

      lastId = projects.rows[projects.rows.length - 1].id;
      console.log(`[SyntheticChecker] Checking batch of ${projects.rows.length} project(s)...`);

      // Check all in parallel with a rolling concurrency limit
      const CONCURRENCY = 100;
      const allResults: Array<{ projectId: string, url: string, statusCode: number | null, latency: number, error: string | null, region: string }> = [];
      const executing = new Set<Promise<any>>();

      for (const p of projects.rows) {
        const promise = checkProject(p, currentRegion).then(res => {
          allResults.push(res);
          executing.delete(promise);
        });
        executing.add(promise);
        if (executing.size >= CONCURRENCY) {
          await Promise.race(executing);
        }
      }
      await Promise.all(executing);

      if (allResults.length > 0) {
        // Chunk inserts to avoid PostgreSQL 65,535 parameter limit
        // 6 parameters per row. 65,535 / 6 = 10,922 rows per chunk max. We'll use 2,000 for safety.
        const DB_CHUNK_SIZE = 2000;
        const insertChunks = chunkArray(allResults, DB_CHUNK_SIZE);

        for (const insertChunk of insertChunks) {
          const values: string[] = [];
          const params: any[] = [];
          insertChunk.forEach((r, i) => {
            const offset = i * 6;
            values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
            params.push(r.projectId, r.url, r.statusCode, r.latency, r.error, r.region);
          });

          await db.query(`
            INSERT INTO synthetic_checks (project_id, url, status_code, latency_ms, error, region)
            VALUES ${values.join(',')}
          `, params);
        }
      }
    }

    console.log('[SyntheticChecker] Done.');
  } catch (err) {
    console.error('[SyntheticChecker] Error running health checks:', err);
  } finally {
    isSyncing = false;
  }
}

async function checkProject(project: Project, region: string) {
  const rawUrl = `${project.deploymentUrl}${project.healthCheckPath ?? '/'}`;
  const start = Date.now();

  try {
    const safeIp = await validateUrlSafe(rawUrl);
    
    const targetUrl = new URL(rawUrl);
    const originalHost = targetUrl.hostname;
    targetUrl.hostname = safeIp; // Hard bind to verified safe IP

    const res = await fetch(targetUrl.toString(), {
      signal: AbortSignal.timeout(10000), // 10s timeout
      headers: {
        'User-Agent': 'Tracepilot-HealthCheck/1.0',
        'X-Health-Check': 'true',
        'Host': originalHost // Preserve original hostname for SNI / routing
      },
      redirect: 'manual', // Do not follow redirects automatically, could redirect to private IP
    });

    // Drain the response body to prevent socket leaks (TIME_WAIT exhaustion)
    if (res.body) await res.arrayBuffer().catch(() => {});

    return { projectId: project.id, url: rawUrl, statusCode: res.status, latency: Date.now() - start, error: null, region };
  } catch (err) {
    const latency = Date.now() - start;
    const errorMsg = (err as Error).message;
    return { projectId: project.id, url: rawUrl, statusCode: null, latency, error: errorMsg, region };
  }
}

// Run every minute via setInterval
setInterval(runHealthChecks, 60 * 1000);
runHealthChecks(); // also run immediately on start
