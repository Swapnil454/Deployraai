import { db } from '../db.js';
import { SpanRecord } from '../writers/spans.js';

export interface Issue {
  id: string;
  projectId: string;
  fingerprint: string;
  title: string;
  message: string;
  exceptionType: string;
  severity: string;
  status: string;
  eventCount: number;
}

// Global queue to prevent PostgreSQL connection pool exhaustion and deadlocks
// when traces API receives bursts of parallel traffic.
let issueQueue = Promise.resolve<any>([]);

export function queueUpsertIssues(spans: SpanRecord[]): Promise<Issue[]> {
  const p = issueQueue.then(() => upsertIssuesFromSpans(spans)).catch(err => {
    console.error("[IssueService] Error upserting issues:", err);
    return [];
  });
  issueQueue = p;
  return p;
}

async function upsertIssuesFromSpans(spans: SpanRecord[]): Promise<Issue[]> {
  const errorSpans = spans.filter(s => s.attributes['error.fingerprint']);
  if (errorSpans.length === 0) return [];

  // 1. Group spans by fingerprint
  const fingerprintGroups = new Map<string, {
    projectId: string;
    fingerprint: string;
    title: string;
    message: string;
    exceptionType: string;
    severity: string;
    stacktrace: string;
    deobfuscatedStacktrace: string | null;
    latestSpanId: string;
    latestTraceId: string;
    count: number;
    spans: SpanRecord[];
  }>();

  for (const span of errorSpans) {
    const fingerprint = span.attributes['error.fingerprint'];
    
    const exEvent = span.events?.find(e => e.name === 'exception');
    if (!exEvent || !exEvent.attributes) continue;

    const exceptionType = exEvent.attributes['exception.type'] || 'UnknownError';
    let message = exEvent.attributes['exception.message'] || exceptionType;
    if (message.length > 500) {
      message = message.substring(0, 500) + '...';
    }
    
    let title = `${exceptionType}: ${message}`;
    if (title.length > 255) title = title.substring(0, 252) + '...';

    const stacktrace = exEvent.attributes['exception.stacktrace'] || '';
    const deobfuscatedStacktrace = exEvent.attributes['exception.deobfuscated_stacktrace'] || null;
    const severity = span.attributes['error.severity'] || 'error';

    const existing = fingerprintGroups.get(fingerprint);
    if (existing) {
      existing.count += 1;
      // We assume spans in the batch are roughly chronologically ordered, 
      // or we just take the last one as the "latest" for this batch.
      existing.latestSpanId = span.spanId;
      existing.latestTraceId = span.traceId;
      existing.spans.push(span);
    } else {
      fingerprintGroups.set(fingerprint, {
        projectId: span.projectId,
        fingerprint,
        title,
        message,
        exceptionType,
        severity,
        stacktrace,
        deobfuscatedStacktrace,
        latestSpanId: span.spanId,
        latestTraceId: span.traceId,
        count: 1,
        spans: [span]
      });
    }
  }

  if (fingerprintGroups.size === 0) return [];

  // Sort deterministically to prevent PostgreSQL deadlocks on ON CONFLICT DO UPDATE
  const groupValues = Array.from(fingerprintGroups.values()).sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  const issuesToReturn: Issue[] = [];

  // 2. Bulk Upsert Issues in Chunks to prevent Postgres 65535 parameter limit
  const CHUNK_SIZE = 500;
  for (let i = 0; i < groupValues.length; i += CHUNK_SIZE) {
    const chunkValues = groupValues.slice(i, i + CHUNK_SIZE);

    const issueParamsWithCount: any[] = [];
    const issueQueryValuesWithCount = chunkValues.map((g, j) => {
      const offset = j * 11;
      issueParamsWithCount.push(
        g.projectId, g.fingerprint, g.title, g.message,
        g.exceptionType, g.severity, g.stacktrace, g.deobfuscatedStacktrace,
        g.latestSpanId, g.latestTraceId, g.count
      );
      return `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10}, $${offset+11}::integer)`;
    }).join(', ');

    const issuesRes = await db.query(`
      INSERT INTO issues (
        project_id, fingerprint, title, message, exception_type, severity,
        latest_stacktrace, latest_deobfuscated_stacktrace, latest_span_id, latest_trace_id, event_count
      ) VALUES ${issueQueryValuesWithCount}
      ON CONFLICT (project_id, fingerprint) DO UPDATE SET
        event_count = issues.event_count + EXCLUDED.event_count,
        last_seen_at = NOW(),
        latest_stacktrace = EXCLUDED.latest_stacktrace,
        latest_deobfuscated_stacktrace = EXCLUDED.latest_deobfuscated_stacktrace,
        latest_span_id = EXCLUDED.latest_span_id,
        latest_trace_id = EXCLUDED.latest_trace_id,
        status = CASE WHEN issues.status = 'resolved' THEN 'regressed' ELSE issues.status END,
        status_changed_at = CASE WHEN issues.status = 'resolved' THEN NOW() ELSE issues.status_changed_at END,
        resolved_at = CASE WHEN issues.status = 'resolved' THEN NULL ELSE issues.resolved_at END,
        updated_at = NOW()
      RETURNING id, project_id as "projectId", fingerprint, title, message, exception_type as "exceptionType", severity, status, event_count as "eventCount"
    `, issueParamsWithCount);

    for (const row of issuesRes.rows) {
      issuesToReturn.push(row as Issue);
    }
  }

  // Note: issue_events bulk insertion has been removed.
  // We now rely on ClickHouse for querying individual issue occurrences.

  return issuesToReturn;
}
