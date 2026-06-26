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
      // Filter out mismatches
      if (rule.event_type !== 'exception') continue;
      const severity = span.attributes['error.severity'] || 'error';
      if (rule.severity !== 'any' && rule.severity !== severity) continue;

      // Threshold check using the spans table
      const countRes = await db.query(`
        SELECT COUNT(*) AS error_count
        FROM spans
        WHERE project_id = $1 
          AND fingerprint = $2 
          AND created_at >= NOW() - ($3::int * INTERVAL '1 minute')
      `, [span.projectId, fingerprint, rule.window_minutes]);

      // Add +1 to include the current span which hasn't been written yet
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
          const now = Date.now();
          if (now - lastTriggered < rule.cooldown_minutes * 60 * 1000) {
            isCooldown = true;
          }
        }

        const title = issue.title;
        const message = issue.message;

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
          title, 
          message, 
          severity, 
          rule.route_type, 
          rule.route_target, 
          isCooldown ? 'suppressed' : 'queued'
        ]);

        const alertEvent = {
          id: eventRes.rows[0].id,
          projectId: span.projectId,
          title,
          message,
          severity,
          fingerprint,
          routeType: rule.route_type,
          routeTarget: rule.route_target
        };

        // Dispatch async, don't wait for completion here
        dispatchAlert(alertEvent).catch(err => {
          console.error(`Failed to dispatch alert internally:`, err);
        });
      }
    }
  } catch (err) {
    console.error('Error during alert evaluation:', err);
  }
}
