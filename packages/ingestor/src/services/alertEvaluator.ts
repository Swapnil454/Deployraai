import { db } from '../db.js';
import { SpanRecord } from '../writers/spans.js';
import { dispatchAlert, AlertEvent } from './alertDispatcher.js';
import { Issue } from './issueService.js';

export async function evaluateAlertsForSpan(span: SpanRecord, issue: Issue) {
  try {
    const fingerprint = span.attributes['error.fingerprint'];
    if (!fingerprint) return;

    // 1. Fetch enabled rules for this project
    const rulesRes = await db.query(
      `SELECT * FROM alert_rules WHERE project_id = $1 AND enabled = true`,
      [span.projectId]
    );

    if (rulesRes.rows.length === 0) return;

    // 2. Evaluate each rule
    for (const rule of rulesRes.rows) {
      // Only process exception rules
      if (rule.event_type !== 'exception') continue;
      const severity = span.attributes['error.severity'] || 'error';
      if (rule.severity !== 'any' && rule.severity !== severity) continue;

      // Threshold check using issue_events (PostgreSQL) — spans table is in Clickhouse only
      const countRes = await db.query(`
        SELECT COUNT(*) AS error_count
        FROM issue_events
        WHERE project_id = $1 
          AND issue_id = $2
          AND occurred_at >= NOW() - ($3::int * INTERVAL '1 minute')
      `, [span.projectId, issue.id, rule.window_minutes]);

      // +1 for the current event being processed (not yet committed)
      const count = parseInt(countRes.rows[0].error_count, 10) + 1;

      if (count >= rule.threshold) {
        // Cooldown check
        const cooldownRes = await db.query(`
          SELECT triggered_at 
          FROM alert_events
          WHERE project_id = $1 
            AND rule_id = $2 
            AND fingerprint = $3
          ORDER BY triggered_at DESC
          LIMIT 1
        `, [span.projectId, rule.id, fingerprint]);

        let isCooldown = false;
        if (cooldownRes.rows.length > 0) {
          const lastTriggered = new Date(cooldownRes.rows[0].triggered_at).getTime();
          if (Date.now() - lastTriggered < rule.cooldown_minutes * 60 * 1000) {
            isCooldown = true;
          }
        }

        // Insert alert event
        const eventRes = await db.query(`
          INSERT INTO alert_events (
            project_id, rule_id, issue_id, fingerprint, title, message, severity, route_type, route_target, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `, [
          span.projectId,
          rule.id,
          issue.id,
          fingerprint,
          issue.title,
          issue.message,
          severity,
          rule.route_type,
          rule.route_target,
          isCooldown ? 'suppressed' : 'queued'
        ]);

        if (!isCooldown) {
          const alertEvent: AlertEvent = {
            id: eventRes.rows[0].id,
            projectId: span.projectId,
            title: issue.title,
            message: issue.message,
            severity,
            fingerprint,
            routeType: rule.route_type,
            routeTarget: rule.route_target
          };

          // Dispatch async — don't block the span write path
          dispatchAlert(alertEvent).catch(err => {
            console.error(`Failed to dispatch alert:`, err);
          });
        }
      }
    }
  } catch (err) {
    console.error('Error during alert evaluation:', err);
  }
}
