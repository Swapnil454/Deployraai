import { db } from '../db.js';

export interface RumRecord {
  projectId: string;
  sessionId: string;
  sequenceNum: number;
  events: any[]; // JSON array
  eventCount: number;
  url: string | null;
  userAgent: string | null;
  durationMs: number;
  errorCount: number;
  createdAt: Date;
}

class RumWriter {
  private buffer: RumRecord[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  // RUM events are huge. Keep batch size small to avoid Postgres parameter limits and memory spikes
  private readonly BATCH_SIZE = 500;
  private readonly FLUSH_INTERVAL_MS = 2000;
  private isFlushing = false;

  async write(rumEvents: RumRecord[]): Promise<void> {
    if (!rumEvents || rumEvents.length === 0) return;
    
    // Hard cap memory usage to prevent V8 Heap OOM under intense RUM traffic
    if (this.buffer.length > 5000) {
      console.warn('[RumWriter] Load shedding: Buffer exceeded 5000 items, dropping incoming RUM data to prevent OOM.');
      return;
    }

    this.buffer.push(...rumEvents);

    if (this.buffer.length >= this.BATCH_SIZE) {
      this.flush().catch(err => console.error('[RumWriter] Unhandled flush error:', err));
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush().catch(err => console.error('[RumWriter] Unhandled flush timer error:', err)), this.FLUSH_INTERVAL_MS);
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

        for (const r of batch) {
          // 10 columns
          values.push(`($${index++}, $${index++}, $${index++}, $${index++}::jsonb, $${index++}, $${index++}, $${index++}, $${index++}, $${index++}, $${index++}::timestamptz)`);
          flatArgs.push(
            r.projectId, 
            r.sessionId, 
            r.sequenceNum, 
            JSON.stringify(r.events), 
            r.eventCount, 
            r.url, 
            r.userAgent, 
            r.durationMs, 
            r.errorCount, 
            r.createdAt.toISOString()
          );
        }

        try {
          const insertQuery = `
            INSERT INTO rum_events (project_id, session_id, sequence_num, events, event_count, url, user_agent, duration_ms, error_count, created_at)
            VALUES ${values.join(', ')}
          `;
          await db.query(insertQuery, flatArgs);
        } catch (dbErr: any) {
          console.error('[RumWriter] Failed to write RUM events to Postgres:', dbErr.message);
          
          // Requeue for retry, but apply load shedding if pipeline backed up
          this.buffer.unshift(...batch);
          if (this.buffer.length > 5000) {
            console.warn('[RumWriter] Buffer exceeded 5000 items, dropping oldest RUM events to prevent OOM.');
            this.buffer.splice(0, this.buffer.length - 5000);
          }
          break; // Exit while loop to back off, will retry on next timer
        }
      }
    } finally {
      this.isFlushing = false;
      if (this.buffer.length > 0 && !this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush().catch(err => console.error('[RumWriter] Unhandled flush timer error:', err)), this.FLUSH_INTERVAL_MS);
      }
    }
  }
}

export const rumWriter = new RumWriter();
