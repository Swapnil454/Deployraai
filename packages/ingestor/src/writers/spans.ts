import { Pool } from 'pg';
import { db } from '../db.js';

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

    // Bulk insert — much faster than individual inserts
    const values = batch.map((_, i) =>
      `($${i*11+1},$${i*11+2},$${i*11+3},$${i*11+4},$${i*11+5},$${i*11+6},$${i*11+7},$${i*11+8},$${i*11+9},$${i*11+10},$${i*11+11})`
    ).join(',');

    const params = batch.flatMap(s => [
      s.projectId, s.deployId, s.traceId, s.spanId, s.parentSpanId,
      s.name, s.startTime, s.endTime, s.durationMs, s.statusCode,
      JSON.stringify(s.attributes)
    ]);

    await db.query(`
      INSERT INTO spans
        (project_id, deploy_id, trace_id, span_id, parent_span_id,
         name, start_time, end_time, duration_ms, status_code, attributes)
      VALUES ${values}
      ON CONFLICT (span_id) DO NOTHING
    `, params);

    // After writing spans, update aggregated metrics
    await this.updateMetrics(batch);
  }

  private async updateMetrics(spans: SpanRecord[]) {
    // Only look at root HTTP spans for request metrics
    const httpSpans = spans.filter(s =>
      s.attributes['http.method'] && !s.parentSpanId
    );

    for (const span of httpSpans) {
      await db.query(`
        INSERT INTO metrics_minutely
          (project_id, deploy_id, bucket, route, method,
           request_count, error_count, total_duration_ms, p99_duration_ms)
        VALUES ($1, $2, date_trunc('minute', $3::timestamptz), $4, $5, 1,
          CASE WHEN $6 >= 400 THEN 1 ELSE 0 END, $7, $7)
        ON CONFLICT (project_id, bucket, route, method)
        DO UPDATE SET
          request_count = metrics_minutely.request_count + 1,
          error_count = metrics_minutely.error_count + EXCLUDED.error_count,
          total_duration_ms = metrics_minutely.total_duration_ms + EXCLUDED.total_duration_ms,
          p99_duration_ms = GREATEST(metrics_minutely.p99_duration_ms, EXCLUDED.p99_duration_ms)
      `, [
        span.projectId,
        span.deployId,
        span.startTime,
        span.attributes['http.route'] ?? span.name,
        span.attributes['http.method'] ?? 'UNKNOWN',
        span.attributes['http.status_code'] ?? 0,
        span.durationMs,
      ]);
    }
  }
}

export const spanWriter = new SpanWriter();
