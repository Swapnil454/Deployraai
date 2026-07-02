import { clickhouse } from '../clickhouse.js';
import { redis } from '../redis.js';

class LogWriter {
  private buffer: any[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 2000;
  private readonly FLUSH_INTERVAL_MS = 2000;
  private isFlushing = false;

  async write(logs: any[]): Promise<void> {
    if (!logs || logs.length === 0) return;
    
    if (this.buffer.length > 50000) {
      console.warn('[LogWriter] Load shedding: Buffer exceeded 50,000 items, dropping incoming logs to prevent OOM.');
      return;
    }

    this.buffer.push(...logs);

    if (this.buffer.length >= this.BATCH_SIZE) {
      this.flush().catch(err => console.error('[LogWriter] Unhandled flush error:', err));
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush().catch(err => console.error('[LogWriter] Unhandled flush timer error:', err)), this.FLUSH_INTERVAL_MS);
    }
  }

  private async flush(): Promise<void> {
    if (this.isFlushing) return;
    this.isFlushing = true;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    try {
      while (this.buffer.length > 0) {
        const batch = this.buffer.splice(0, this.BATCH_SIZE);
        if (batch.length === 0) break;

        // Group logs by projectId for Redis publishing
        const logsByProject = new Map<string, any[]>();
        const clickhouseRows: any[] = [];

        for (const log of batch) {
          if (!logsByProject.has(log.projectId)) {
            logsByProject.set(log.projectId, []);
          }
          logsByProject.get(log.projectId)!.push(log);

          clickhouseRows.push({
            project_id: log.projectId,
            deploy_id: log.deployId || '',
            timestamp: log.timestamp, // Assuming ISO string from payload
            level: log.level || 'info',
            message: log.message || '',
            request_id: log.requestId || '',
            region: log.region || '',
            source: log.source || 'unknown',
            attributes: log.attributes || {},
            raw: log.raw ? JSON.stringify(log.raw) : '{}'
          });
        }

        try {
          await clickhouse.insert({
            table: 'logs',
            values: clickhouseRows,
            format: 'JSONEachRow'
          });

          // Publish to Redis after successful insert
          for (const [projectId, projectLogs] of logsByProject.entries()) {
            redis.publish(`logs:${projectId}`, JSON.stringify(projectLogs)).catch(err => {
              console.error(`Failed to publish logs to Redis for project ${projectId}`, err);
            });
          }
        } catch (err) {
          console.error('[LogWriter] Failed to write logs to ClickHouse', err);
          // Unshift batch and back off
          this.buffer.unshift(...batch);
          if (this.buffer.length > 50000) {
            console.warn('[LogWriter] Buffer exceeded 50,000 items, dropping oldest logs to prevent OOM.');
            this.buffer.splice(0, this.buffer.length - 50000);
          }
          break;
        }
      }
    } finally {
      this.isFlushing = false;
      if (this.buffer.length > 0 && !this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush().catch(err => console.error('[LogWriter] Unhandled flush timer error:', err)), this.FLUSH_INTERVAL_MS);
      }
    }
  }
}

export const logWriter = new LogWriter();
