import { Pool } from 'pg';
import { db } from '../db.js';
import { clickhouse } from '../clickhouse.js';
import crypto from 'crypto';

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

  write(spans: SpanRecord[]): Promise<void> {
    this.buffer.push(...spans);

    if (this.buffer.length >= this.BATCH_SIZE) {
      return this.flush();
    }

    // Schedule a flush if not already scheduled
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL_MS);
    }

    return Promise.resolve();
  }

  private async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const batch = this.buffer.splice(0, this.BATCH_SIZE);
    if (batch.length === 0) return;

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
    const chBatch = batch.map(s => ({
      project_id: s.projectId,
      deploy_id: s.deployId,
      trace_id: s.traceId,
      span_id: s.spanId,
      parent_span_id: s.parentSpanId || '',
      name: s.name,
      start_time: s.startTime.getTime(),
      duration_ms: s.durationMs,
      status_code: s.statusCode,
      attributes: sanitizeAttributes(s.attributes)
    }));

    // ClickHouse Bulk Insert — best-effort, don't fail PG write if CH is offline
    try {
      await clickhouse.insert({
        table: 'spans',
        values: chBatch,
        format: 'JSONEachRow'
      });
    } catch (chErr: any) {
      console.warn('[SpanWriter] Clickhouse unavailable, spans not persisted to CH:', chErr.message);
    }

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

      const egValues = Array.from(groupMap.values());
      const egParams = egValues.flatMap(eg => [
        eg.fingerprint, eg.projectId, eg.exceptionType, eg.stackTrace, eg.deployId, eg.lastSeen, eg.count
      ]);
      const egQueryValues = egValues.map((_, i) => 
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

    // Also insert to Postgres spans table for alerting threshold checks
    const pgParams: any[] = [];
    const pgValues: string[] = [];
    batch.forEach((s, i) => {
      pgParams.push(
        s.projectId, s.deployId, s.traceId, s.spanId, s.parentSpanId || null, 
        s.name, s.startTime, s.endTime, s.durationMs, s.statusCode, 
        sanitizeAttributes(s.attributes), JSON.stringify(s.events), s.attributes['error.fingerprint'] || null
      );
      const offset = i * 13;
      pgValues.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10}, $${offset+11}, $${offset+12}, $${offset+13})`);
    });

    if (pgValues.length > 0) {
      await db.query(`
        INSERT INTO spans (
          project_id, deploy_id, trace_id, span_id, parent_span_id,
          name, start_time, end_time, duration_ms, status_code, attributes, events, fingerprint
        ) VALUES ${pgValues.join(',')}
        ON CONFLICT (span_id) DO NOTHING
      `, pgParams);
    }
  }
}

export const spanWriter = new SpanWriter();
