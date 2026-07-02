// packages/ingestor/src/middleware/usage-check.ts
import { db } from '../db.js';

import { redis } from '../redis.js';

function getMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;
}

export async function checkUsageCap(req: any, reply: any) {
  let projectId = req.auth?.projectId || req.params?.projectId || req.projectId;
  if (!projectId && req.body?.projectId) projectId = req.body.projectId;
  if (!projectId) return;
  
  const capCacheKey = `cache:monthly_span_cap:${projectId}`;
  let monthly_span_cap: number | null = null;
  
  const cachedCap = await redis.get(capCacheKey);
  if (cachedCap !== null) {
    monthly_span_cap = parseInt(cachedCap, 10);
  } else {
    const project = await db.query(
      'SELECT monthly_span_cap FROM projects WHERE id = $1', [projectId]
    );
    if (!project.rows[0]) return;
    
    monthly_span_cap = project.rows[0].monthly_span_cap;
    // Cache for 5 minutes (300 seconds)
    await redis.set(capCacheKey, monthly_span_cap ? monthly_span_cap.toString() : '0', 'EX', 300);
  }

  if (!monthly_span_cap) return; // no cap set — allow

  const monthKey = getMonthKey();
  const cacheKey = `usage:spans:${projectId}:${monthKey}`;
  
  let used = await redis.get(cacheKey);
  
  // If not in cache, fallback to clickhouse query (not postgres) or just let it pass until sync runs
  // A "best-effort" approach: if redis misses, we allow the request but trigger a background sync.
  // We'll treat `used` as 0 if null, and background sync will fix it.
  if (used === null) {
    used = '0';
    // Ideally trigger a sync here, but for now we rely on the hourly cron.
    // The hourly cron will set this value.
    // We can just increment it here so we at least track current batch.
  }

  // Increment by the number of spans in this payload (approximate or exact)
  // The route is usually POST /v1/traces which has resourceSpans in body
  let spanCount = 0;
  if (req.body?.resourceSpans) {
    for (const rs of req.body.resourceSpans) {
      if (rs.scopeSpans) {
        for (const ss of rs.scopeSpans) {
          if (ss.spans) spanCount += ss.spans.length;
        }
      }
    }
  } else {
    spanCount = 1; // default fallback
  }

  // Increment in Redis (will be corrected by hourly sync)
  const currentCount = await redis.incrby(cacheKey, spanCount);
  
  if (used === null) {
    // If we just created the key, give it a TTL of 32 days so it auto-expires after the month ends
    await redis.expire(cacheKey, 32 * 24 * 60 * 60);
  }
  
  // Enforce at 105% buffer to account for sync lag and avoid false positives
  const limitWithBuffer = Math.floor(monthly_span_cap * 1.05);

  if (currentCount > limitWithBuffer) {
    return reply.status(429).send({
      error: 'Monthly span limit reached. Upgrade your plan.',
      code: 'SPAN_LIMIT_EXCEEDED'
    });
  }
}
