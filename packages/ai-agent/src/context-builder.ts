import { db } from './db.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'dummy_key',
});

export async function buildFingerprintContext(projectId: string, fingerprint: string) {
  try {
    // Try the newer 'issues' table first (canonical error group table)
    let group = await db.query(`
      SELECT exception_type, latest_stacktrace as sample_stack_trace, first_seen_at as first_seen, last_seen_at as last_seen, event_count as occurrence_count
      FROM issues
      WHERE project_id = $1 AND fingerprint = $2
      LIMIT 1
    `, [projectId, fingerprint]);

    // Fall back to legacy error_groups table (older projects)
    if (!group.rowCount || group.rowCount === 0) {
      group = await db.query(`
        SELECT exception_type, sample_stack_trace, first_seen, last_seen, occurrence_count
        FROM error_groups
        WHERE project_id = $1 AND fingerprint = $2
        LIMIT 1
      `, [projectId, fingerprint]).catch(() => ({ rows: [], rowCount: 0 } as any));
    }

    if (!group.rowCount || group.rowCount === 0) return null;

    const errorLogs = await db.query(`
      SELECT timestamp, message
      FROM logs
      WHERE project_id = $1 AND level = 'error'
      ORDER BY timestamp DESC
      LIMIT 20
    `, [projectId]);

    return {
      exceptionType: group.rows[0].exception_type,
      stackTrace: group.rows[0].sample_stack_trace,
      occurrenceCount: group.rows[0].occurrence_count,
      firstSeen: group.rows[0].first_seen,
      lastSeen: group.rows[0].last_seen,
      errorLogs: errorLogs.rows,
    };
  } catch (err: any) {
    console.error('Error building fingerprint context:', err.message);
    return null;
  }
}

export async function buildErrorContext(projectId: string, deployId: string) {
  const [errorSpans, errorLogs, affectedRoutes] = await Promise.all([
    // Get all ERROR spans from this deploy
    db.query(`
      SELECT name, attributes, events, start_time, duration_ms
      FROM spans
      WHERE project_id = $1
        AND deploy_id = $2
        AND status_code = 2
      ORDER BY start_time DESC
      LIMIT 20
    `, [projectId, deployId]),

    // Get error logs
    db.query(`
      SELECT timestamp, message, request_id, region
      FROM logs
      WHERE project_id = $1
        AND deploy_id = $2
        AND level = 'error'
      ORDER BY timestamp DESC
      LIMIT 50
    `, [projectId, deployId]),

    // Routes with high error rate on this deploy vs previous
    db.query(`
      SELECT
        route, method,
        SUM(error_count)::float / NULLIF(SUM(request_count), 0) as error_rate
      FROM metrics_minutely
      WHERE project_id = $1 AND deploy_id = $2
      GROUP BY route, method
      HAVING SUM(error_count)::float / NULLIF(SUM(request_count), 0) > 0.1
      ORDER BY error_rate DESC
    `, [projectId, deployId]),
  ]);

  // Extract stack traces from span events
  const stackTraces = errorSpans.rows.flatMap(span =>
    (span.events ?? [])
      .filter((e: any) => e.name === 'exception')
      .map((e: any) => ({
        message: e.attributes?.['exception.message'],
        type: e.attributes?.['exception.type'],
        stacktrace: e.attributes?.['exception.stacktrace'],
        route: span.attributes?.['http.route'],
        timestamp: span.start_time,
      }))
  );

  return {
    stackTraces,
    errorLogs: errorLogs.rows,
    affectedRoutes: affectedRoutes.rows,
    summary: {
      totalErrors: errorSpans.rowCount,
      uniqueErrorTypes: [...new Set(stackTraces.map(s => s.type))],
    },
  };
}

// Feed this context to your AI agent
export async function generateFix(projectId: string, deployId: string, repoCode: string) {
  const context = await buildErrorContext(projectId, deployId);

  const prompt = `
You are analyzing a deployment that has errors. Here is the observability data:

STACK TRACES:
${context.stackTraces.map(t => `
Route: ${t.route}
Error: ${t.type}: ${t.message}
Stack:
${t.stacktrace}
`).join('\n---\n')}

ERROR LOGS (most recent):
${context.errorLogs.slice(0, 10).map(l => l.message).join('\n')}

AFFECTED ROUTES:
${context.affectedRoutes.map(r => `${r.method} ${r.route}: ${(r.error_rate * 100).toFixed(1)}% error rate`).join('\n')}

Based on this data, analyze the root cause and generate a minimal code fix.
Return JSON: { "rootCause": string, "fix": [{ "file": string, "originalCode": string, "fixedCode": string }] }
  `;

  // Call your AI model
  const response = await anthropicClient.messages.create({
    model: 'claude-3-5-sonnet-20240620',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  return JSON.parse((response.content[0] as any).text);
}
