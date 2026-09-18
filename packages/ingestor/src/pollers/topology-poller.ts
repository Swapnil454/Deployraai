import { clickhouse } from '../clickhouse.js';
import { db } from '../db.js';

export class TopologyPoller {
  private timer: NodeJS.Timeout | null = null;
  private isSyncing = false;

  start() {
    if (this.timer) return;
    
    // Run sync immediately on startup, then every minute
    this.sync();
    this.timer = setInterval(() => this.sync(), 60 * 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sync() {
    if (this.isSyncing) {
      console.warn('TopologyPoller is already syncing, skipping this interval to prevent overlap.');
      return;
    }
    
    this.isSyncing = true;
    let client;
    let lockAcquired = false;
    
    try {
      client = await db.connect();
      // Use an arbitrary unique integer for the lock (e.g. 2002)
      const { rows } = await client.query('SELECT pg_try_advisory_lock(2002) as locked');
      if (!rows[0].locked) {
        // Another instance is running this poller
        return;
      }
      lockAcquired = true;
      
      // Look back at the last 3 minutes to accommodate slightly delayed spans arriving in batches
      const query = `
        INSERT INTO topology_edges_1m
        WITH recent_spans AS (
          SELECT 
            span_id,
            parent_span_id,
            attributes['service.name'] as service_name,
            attributes['db.system'] as db_system,
            duration_ms,
            status_code,
            project_id,
            start_time
          FROM spans
          WHERE start_time >= now() - INTERVAL 3 MINUTE
            AND attributes['service.name'] != ''
        ),
        edges AS (
          SELECT 
            parent.project_id as project_id,
            toStartOfMinute(child.start_time) as bucket,
            parent.service_name as source,
            child.service_name as target,
            'service' as target_type,
            child.duration_ms as duration_ms,
            child.status_code as status_code
          FROM recent_spans child
          JOIN recent_spans parent ON child.parent_span_id = parent.span_id
          WHERE child.service_name != '' 
            AND parent.service_name != child.service_name
            
          UNION ALL
          
          SELECT 
            project_id,
            toStartOfMinute(start_time) as bucket,
            service_name as source,
            db_system as target,
            'database' as target_type,
            duration_ms,
            status_code
          FROM recent_spans
          WHERE db_system != ''
        )
        SELECT 
          project_id,
          bucket,
          source, 
          target,
          any(target_type) as target_type,
          COUNT(*) as request_count,
          sum(if(status_code = 2, 1, 0)) as error_count,
          sum(duration_ms) as total_duration_ms
        FROM edges
        GROUP BY project_id, bucket, source, target;
      `;
      
      await clickhouse.command({ query });
    } catch (err) {
      console.error('Failed to sync topology edges:', err);
    } finally {
      this.isSyncing = false;
      if (client) {
        if (lockAcquired) {
          await client.query('SELECT pg_advisory_unlock(2002)');
        }
        client.release();
      }
    }
  }
}

export const topologyPoller = new TopologyPoller();
