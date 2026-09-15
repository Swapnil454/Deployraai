import { db } from '../db.js';

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
  // Reduce batch size to prevent hitting Postgres' 65,535 parameter limit.
  // 6 columns * 2000 rows = 12,000 parameters (well within safe limits).
  private readonly BATCH_SIZE = 2000; 
  private readonly FLUSH_INTERVAL_MS = 2000;
  private isFlushing = false;

  async write(profiles: ProfileRecord[]): Promise<void> {
    if (!profiles || profiles.length === 0) return;
    
    // Hard cap memory usage to prevent V8 Heap OOM under intense profiling traffic
    if (this.buffer.length > 50000) {
      console.warn('[ProfileWriter] Load shedding: Buffer exceeded 50,000 items, dropping incoming profiles to prevent OOM.');
      return;
    }

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

        const values: string[] = [];
        const flatArgs: any[] = [];
        let index = 1;

        for (const s of batch) {
          values.push(`($${index++}, $${index++}, $${index++}, $${index++}::timestamptz, $${index++}, $${index++})`);
          flatArgs.push(s.projectId, s.serviceName, s.profileType, s.timestamp.toISOString(), s.stackTrace, s.value);
        }

        try {
          const insertQuery = `
            INSERT INTO profiles (project_id, service_name, profile_type, timestamp, stack_trace, value)
            VALUES ${values.join(', ')}
          `;
          await db.query(insertQuery, flatArgs);
        } catch (dbErr: any) {
          console.error('[ProfileWriter] Failed to write profiles to Postgres:', dbErr.message);
          
          // Requeue for retry, but apply load shedding if pipeline backed up
          this.buffer.unshift(...batch);
          if (this.buffer.length > 50000) {
            console.warn('[ProfileWriter] Buffer exceeded 50,000 items, dropping oldest profiles to prevent OOM.');
            this.buffer.splice(0, this.buffer.length - 50000);
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
