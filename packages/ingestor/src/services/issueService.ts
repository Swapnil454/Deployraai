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

export async function upsertIssueFromSpan(span: SpanRecord): Promise<Issue | null> {
  const fingerprint = span.attributes['error.fingerprint'];
  if (!fingerprint) return null;

  // We extract title and message from the exception event
  const exEvent = span.events?.find(e => e.name === 'exception');
  if (!exEvent || !exEvent.attributes) return null;

  const exceptionType = exEvent.attributes['exception.type'] || 'UnknownError';
  let message = exEvent.attributes['exception.message'] || exceptionType;
  // Truncate message if it's too long
  if (message.length > 500) {
    message = message.substring(0, 500) + '...';
  }
  
  // Title is a summary: "TypeError: Cannot read properties..."
  let title = `${exceptionType}: ${message}`;
  if (title.length > 255) title = title.substring(0, 252) + '...';

  const stacktrace = exEvent.attributes['exception.stacktrace'] || '';
  const deobfuscatedStacktrace = exEvent.attributes['exception.deobfuscated_stacktrace'] || null;
  const severity = span.attributes['error.severity'] || 'error';

  // Upsert the Issue
  const issueRes = await db.query(`
    INSERT INTO issues (
      project_id,
      fingerprint,
      title,
      message,
      exception_type,
      severity,
      latest_stacktrace,
      latest_deobfuscated_stacktrace,
      latest_span_id,
      latest_trace_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (project_id, fingerprint)
    DO UPDATE SET
      event_count = issues.event_count + 1,
      last_seen_at = NOW(),
      latest_stacktrace = EXCLUDED.latest_stacktrace,
      latest_deobfuscated_stacktrace = EXCLUDED.latest_deobfuscated_stacktrace,
      latest_span_id = EXCLUDED.latest_span_id,
      latest_trace_id = EXCLUDED.latest_trace_id,
      status = CASE
        WHEN issues.status = 'resolved' THEN 'regressed'
        ELSE issues.status
      END,
      status_changed_at = CASE
        WHEN issues.status = 'resolved' THEN NOW()
        ELSE issues.status_changed_at
      END,
      resolved_at = CASE
        WHEN issues.status = 'resolved' THEN NULL
        ELSE issues.resolved_at
      END,
      updated_at = NOW()
    RETURNING id, project_id as "projectId", fingerprint, title, message, exception_type as "exceptionType", severity, status, event_count as "eventCount"
  `, [
    span.projectId,
    fingerprint,
    title,
    message,
    exceptionType,
    severity,
    stacktrace,
    deobfuscatedStacktrace,
    span.spanId,
    span.traceId
  ]);

  const issue = issueRes.rows[0] as Issue;

  // Insert into issue_events
  await db.query(`
    INSERT INTO issue_events (
      issue_id,
      project_id,
      span_id,
      trace_id,
      user_id,
      environment,
      release,
      deploy_id,
      message,
      stacktrace,
      deobfuscated_stacktrace,
      session_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `, [
    issue.id,
    span.projectId,
    span.spanId,
    span.traceId,
    span.attributes['user.id'] || null,
    span.attributes['deployment.environment'] || 'production',
    span.attributes['service.version'] || null,
    span.deployId,
    message,
    stacktrace,
    deobfuscatedStacktrace,
    span.attributes['session_id'] || null
  ]);

  return issue;
}
