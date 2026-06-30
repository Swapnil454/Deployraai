import { db } from '../db.js';
import { redis } from '../redis.js';
import { clickhouse } from '../clickhouse.js';

export class UsagePoller {
  private timer: NodeJS.Timeout | null = null;

  start() {
    if (this.timer) return;
    
    // Run sync immediately on startup, then every hour
    this.sync();
    this.timer = setInterval(() => this.sync(), 60 * 60 * 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private isSyncing = false;

  private async sync() {
    if (this.isSyncing) {
      console.warn('UsagePoller is already syncing, skipping this interval to prevent overlap.');
      return;
    }
    
    this.isSyncing = true;
    let client;
    let lockAcquired = false;
    try {
      client = await db.connect();
      const { rows } = await client.query('SELECT pg_try_advisory_lock(2001) as locked');
      if (!rows[0].locked) {
        console.log('[UsagePoller] Another replica is running the sync, aborting.');
        return;
      }
      lockAcquired = true;
      
      console.log('[UsagePoller] Lock acquired, starting billing usage sync...');
      const now = new Date();
      const monthKey = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;
      const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      
      // Calculate TTL aligned to end of the month + 2 days buffer
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const ttlSeconds = Math.max(1, Math.floor((nextMonth.getTime() - now.getTime()) / 1000) + (2 * 24 * 60 * 60));

      let hasMore = true;
      let lastId = '00000000-0000-0000-0000-000000000000'; // Cursor

      while (hasMore) {
        // Fetch projects using cursor pagination
        const projects = await db.query(
          'SELECT id, monthly_span_cap FROM projects WHERE monthly_span_cap IS NOT NULL AND id > $1 ORDER BY id ASC LIMIT 1000',
          [lastId]
        );

        if (projects.rows.length === 0) {
          hasMore = false;
          break;
        }

        lastId = projects.rows[projects.rows.length - 1].id;
        const projectIds = projects.rows.map(p => p.id);
        
        // Bulk query ClickHouse for this chunk
        const chRes = await clickhouse.query({
          query: `
            SELECT project_id, count() as c 
            FROM spans 
            WHERE project_id IN ({projectIds: Array(String)}) 
              AND start_time >= parseDateTimeBestEffort({from: String})
            GROUP BY project_id
          `,
          query_params: { projectIds, from: firstDay },
          format: 'JSONEachRow'
        });
        
        const data = await chRes.json<{project_id: string, c: string}>();
        
        // Build a map of actual counts from ClickHouse
        const countMap = new Map<string, number>();
        for (const row of data) {
          countMap.set(row.project_id, parseInt(row.c || '0', 10));
        }
        
        // Update Redis using a pipeline for the entire chunk
        const pipeline = redis.pipeline();
        
        for (const projectId of projectIds) {
          const cacheKey = `usage:spans:${projectId}:${monthKey}`;
          const actualCount = countMap.get(projectId) || 0;
          
          pipeline.set(cacheKey, actualCount);
          pipeline.expire(cacheKey, ttlSeconds);
        }
        
        await pipeline.exec();
      }
    } catch (err) {
      console.error('Failed to sync usage caps from ClickHouse:', err);
    } finally {
      this.isSyncing = false;
      if (client) {
        // Only release the advisory lock if we actually acquired it.
        // Calling pg_advisory_unlock without having acquired the lock is a no-op in PostgreSQL,
        // but we guard it explicitly for semantic correctness.
        if (lockAcquired) {
          await client.query('SELECT pg_advisory_unlock(2001)');
          console.log('[UsagePoller] Lock released.');
        }
        client.release();
      }
    }
  }
}

export const usagePoller = new UsagePoller();
