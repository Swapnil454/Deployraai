import { Pool } from 'pg';
import { db } from '../db.js';
import { clickhouse } from '../clickhouse.js';
import { redis } from '../redis.js';
import crypto from 'crypto';

// Utility to split array into chunks for concurrency control
function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export interface SpanRecord {
  projectId: string;
  deployId: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  statusCode: number; // 0=UNSET, 1=OK, 2=ERROR
  attributes: Record<string, any>;
  events: any[];
}

const REDACTED_KEYS = ['password', 'token', 'secret', 'api_key', 'authorization'];

function sanitizeAttributes(attrs: Record<string, any>) {
  if (!attrs) return {};
  return Object.fromEntries(
    Object.entries(attrs).filter(([key]) =>
      !REDACTED_KEYS.some(k => key.toLowerCase().includes(k))
    )
  );
}

function computeErrorFingerprint(events: any[]): { fingerprint: string, type: string, stack: string } | null {
  const exEvent = events.find(e => e.name === 'exception');
  if (!exEvent || !exEvent.attributes) return null;

  const exceptionType = exEvent.attributes['exception.type'] || 'UnknownException';
  const stack = exEvent.attributes['exception.stacktrace'] || '';
  if (!stack) return null;

  const frames = stack.split('\n');
  const normalizedFrames = [];
  
  for (const frame of frames) {
    const match = frame.match(/at .+ \((.+):\d+:\d+\)/);
    if (match && match[1]) {
      normalizedFrames.push(match[1]);
    } else {
      const fallbackMatch = frame.match(/at (.+):\d+:\d+/);
      if (fallbackMatch && fallbackMatch[1]) {
        normalizedFrames.push(fallbackMatch[1]);
      }
    }
    if (normalizedFrames.length === 3) break;
  }

  const hashString = exceptionType + normalizedFrames.join('|');
  const fingerprint = crypto.createHash('sha256').update(hashString).digest('hex');

  return { fingerprint, type: exceptionType, stack };
}

class SpanWriter {
  private buffer: SpanRecord[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 500;
  private readonly FLUSH_INTERVAL_MS = 2000;
  private isFlushing = false;

  write(spans: SpanRecord[]): Promise<void> {
    if (this.buffer.length > 50000) {
      console.warn('[SpanWriter] Load shedding: Buffer exceeded 50,000 items, dropping incoming batch to prevent OOM.');
      return Promise.resolve();
    }

    this.buffer.push(...spans);

    if (this.buffer.length >= this.BATCH_SIZE) {
      this.flush().catch(err => console.error('[SpanWriter] Unhandled flush error:', err));
    } else if (!this.flushTimer) {
      // Schedule a flush if not already scheduled
      this.flushTimer = setTimeout(() => this.flush().catch(err => console.error('[SpanWriter] Unhandled flush timer error:', err)), this.FLUSH_INTERVAL_MS);
    }

    return Promise.resolve();
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

        const errorGroups = [];

        for (const s of batch) {
          if (s.events && s.events.length > 0) {
            const errInfo = computeErrorFingerprint(s.events);
            if (errInfo) {
              s.attributes['error.fingerprint'] = errInfo.fingerprint;
              errorGroups.push({
                fingerprint: errInfo.fingerprint,
                projectId: s.projectId,
                deployId: s.deployId,
                exceptionType: errInfo.type,
                stackTrace: errInfo.stack,
                timestamp: s.startTime
              });
            }
          }
        }

        // ClickHouse Bulk Insert
        const chBatch = batch
          .filter(s => !(s.attributes['custom.event'] === true || s.attributes['custom.event'] === 'true'))
          .map(s => ({
            project_id: s.projectId,
            deploy_id: s.deployId,
            trace_id: s.traceId,
            span_id: s.spanId,
            parent_span_id: s.parentSpanId || '',
            name: s.name,
            start_time: s.startTime.getTime(),
            duration_ms: s.durationMs,
            status_code: s.statusCode,
            attributes: sanitizeAttributes(s.attributes),
            events: s.events ? JSON.stringify(s.events) : '[]'
          }));

        // ClickHouse Bulk Insert — best-effort, don't fail PG write if CH is offline
        try {
          if (chBatch.length > 0) {
            await clickhouse.insert({
              table: 'spans',
              values: chBatch,
              format: 'JSONEachRow'
            });

            // Publish root spans to Redis for SSE live stream
            const rootSpansByProject = new Map<string, any[]>();
            for (const span of batch) {
              if (!span.parentSpanId || span.parentSpanId === '') {
                if (!rootSpansByProject.has(span.projectId)) {
                  rootSpansByProject.set(span.projectId, []);
                }
                rootSpansByProject.get(span.projectId)!.push({
                  span_id: span.spanId,
                  trace_id: span.traceId,
                  parent_span_id: span.parentSpanId || '',
                  name: span.name,
                  start_time: span.startTime.getTime(), // Expected as number for UI parsing or Date string. Usually string is safer, but UI traces-stream sends parsed JSON. Let's send ISO string just in case, wait, ClickHouse returned ISO string. Let's send ISO string.
                  duration_ms: span.durationMs,
                  status_code: span.statusCode,
                  attributes: sanitizeAttributes(span.attributes),
                  events: span.events || []
                });
              }
            }

            for (const [projectId, rootSpans] of rootSpansByProject.entries()) {
              redis.publish(`traces:${projectId}`, JSON.stringify(rootSpans)).catch(err => {
                console.error(`[SpanWriter] Failed to publish traces to Redis for project ${projectId}`, err);
              });
            }
          }
        } catch (chErr: any) {
          console.warn('[SpanWriter] Clickhouse unavailable, spans not persisted to CH:', chErr.message);
        }

        try {
          // Upsert Error Groups to Postgres
          if (errorGroups.length > 0) {
            // De-duplicate within the same batch before inserting
            const groupMap = new Map<string, typeof errorGroups[0] & { count: number, lastSeen: Date }>();
            for (const eg of errorGroups) {
              const existing = groupMap.get(eg.fingerprint);
              if (existing) {
                existing.count += 1;
                if (eg.timestamp > existing.lastSeen) existing.lastSeen = eg.timestamp;
              } else {
                groupMap.set(eg.fingerprint, { ...eg, count: 1, lastSeen: eg.timestamp });
              }
            }

            // Sort deterministically to prevent PostgreSQL deadlocks on ON CONFLICT DO UPDATE
            const egValues = Array.from(groupMap.values()).sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
            
            // Chunk inserts to avoid PostgreSQL 65,535 parameter limit
            // 7 parameters per row. 65,535 / 7 = 9,362 rows per chunk max. We'll use 2,000 for safety.
            const DB_CHUNK_SIZE = 2000;
            const chunks = chunkArray(egValues, DB_CHUNK_SIZE);

            for (const chunk of chunks) {
              const egParams = chunk.flatMap(eg => [
                eg.fingerprint, eg.projectId, eg.exceptionType, eg.stackTrace, eg.deployId, eg.lastSeen, eg.count
              ]);
              const egQueryValues = chunk.map((_, i) => 
                `($${i*7+1}, $${i*7+2}, $${i*7+3}, $${i*7+4}, $${i*7+5}, $${i*7+6}::timestamptz, $${i*7+6}::timestamptz, $${i*7+7})`
              ).join(',');

              await db.query(`
                INSERT INTO error_groups (
                  fingerprint, project_id, exception_type, sample_stack_trace, deploy_id, first_seen, last_seen, occurrence_count
                ) VALUES ${egQueryValues}
                ON CONFLICT (fingerprint) DO UPDATE SET
                  last_seen = GREATEST(error_groups.last_seen, EXCLUDED.last_seen),
                  occurrence_count = error_groups.occurrence_count + EXCLUDED.occurrence_count
              `, egParams);
            }
          }

          // Also insert to Postgres custom_events table for business metrics
          const customEvents = batch.filter(s => s.attributes['custom.event'] === true || s.attributes['custom.event'] === 'true');
          
          if (customEvents.length > 0) {
            const CE_CHUNK_SIZE = 2000;
            const ceChunks = chunkArray(customEvents, CE_CHUNK_SIZE);

            for (const chunk of ceChunks) {
              const ceParams: any[] = [];
              const ceValues: string[] = [];

              chunk.forEach((s, i) => {
                const offset = ceValues.length * 5;
                ceParams.push(
                  s.projectId, s.traceId || null, s.name, sanitizeAttributes(s.attributes), s.startTime
                );
                ceValues.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5})`);
              });

              await db.query(`
                INSERT INTO custom_events (
                  project_id, trace_id, event_name, properties, created_at
                ) VALUES ${ceValues.join(',')}
              `, ceParams);
            }
          }
        } catch (pgErr: any) {
          console.error('[SpanWriter] Failed to insert batch to Postgres:', pgErr.message);
          
          // Class 22 is PostgreSQL Data Exception (e.g., string truncation, invalid UUID format)
          if (pgErr.code && pgErr.code.startsWith('22')) {
            console.error(`[SpanWriter] Data exception (Code ${pgErr.code}). Discarding poison pill batch to prevent pipeline blockage.`);
            continue; // Continue to next batch instead of breaking entirely if possible, but actually we dropped it, so we can just let it go.
          }

          // Put the batch back to retry on next flush
          this.buffer.unshift(...batch);
          // Cap buffer at 50,000 to prevent OOM
          if (this.buffer.length > 50000) {
            console.warn('[SpanWriter] Buffer exceeded 50,000 items, dropping oldest spans to prevent OOM.');
            this.buffer.splice(0, this.buffer.length - 50000);
          }
          
          // IMPORTANT: Break out of the while loop on failure to back off and prevent infinite retry loops.
          // A new flush will be triggered by the next write or timer.
          break;
        }
      }
    } finally {
      this.isFlushing = false;
      // If we broke out early but still have items, ensure timer is running for backoff
      if (this.buffer.length > 0 && !this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush().catch(err => console.error('[SpanWriter] Unhandled flush timer error:', err)), this.FLUSH_INTERVAL_MS);
      }
    }
  }
}

export const spanWriter = new SpanWriter();
