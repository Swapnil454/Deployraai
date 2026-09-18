import { clickhouse } from '../clickhouse.js';

export interface ProfileRecord {
  projectId: string;
  serviceName: string;
  profileType: string;
  timestamp: Date;
  stackTrace: string; // Flattened with ';'
  value: number;
}

class ProfileWriter {
  private buffer: ProfileRecord[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  // ClickHouse is optimized for huge batches
  private readonly BATCH_SIZE = 50000; 
  private readonly FLUSH_INTERVAL_MS = 3000;
  private isFlushing = false;

  async write(profiles: ProfileRecord[]): Promise<void> {
    if (!profiles || profiles.length === 0) return;

    this.buffer.push(...profiles);

    if (this.buffer.length >= this.BATCH_SIZE) {
      this.flush().catch(err => console.error('[ProfileWriter] Unhandled flush error:', err));
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush().catch(err => console.error('[ProfileWriter] Unhandled flush timer error:', err)), this.FLUSH_INTERVAL_MS);
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

        try {
          await clickhouse.insert({
            table: 'profiles',
            values: batch.map(s => ({
              project_id: s.projectId,
              service_name: s.serviceName,
              profile_type: s.profileType,
              timestamp: s.timestamp.getTime(), // ClickHouse DateTime64 takes millisecond timestamp
              stack_trace: s.stackTrace,
              value: s.value
            })),
            format: 'JSONEachRow'
          });
        } catch (dbErr: any) {
          console.error('[ProfileWriter] Failed to write profiles to ClickHouse:', dbErr.message);
          
          // Requeue for retry
          this.buffer.unshift(...batch);
          
          // Safety cap in case of extended ClickHouse outage
          if (this.buffer.length > 500000) {
            console.warn('[ProfileWriter] Buffer exceeded 500,000 items, dropping oldest profiles to prevent OOM.');
            this.buffer.splice(0, this.buffer.length - 500000);
          }
          break; // Exit while loop to back off, will retry on next timer
        }
      }
    } finally {
      this.isFlushing = false;
      if (this.buffer.length > 0 && !this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush().catch(err => console.error('[ProfileWriter] Unhandled flush timer error:', err)), this.FLUSH_INTERVAL_MS);
      }
    }
  }
}

export const profileWriter = new ProfileWriter();
