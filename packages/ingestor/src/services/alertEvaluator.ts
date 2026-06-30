import { db } from '../db.js';
import { clickhouse } from '../clickhouse.js';
import { SpanRecord } from '../writers/spans.js';
import { dispatchAlert, AlertEvent } from './alertDispatcher.js';
import { Issue } from './issueService.js';

export async function evaluateAlertsForIssues(spans: SpanRecord[], issues: Issue[]) {
  if (issues.length === 0) return;

  try {
    // 1. Group issues by Project ID
    const projectIssues = new Map<string, Issue[]>();
    for (const issue of issues) {
      if (!projectIssues.has(issue.projectId)) {
        projectIssues.set(issue.projectId, []);
      }
      projectIssues.get(issue.projectId)!.push(issue);
    }

    // 2. Evaluate per project
    for (const [projectId, projectIssuesList] of projectIssues.entries()) {
      // Fetch enabled rules for this project ONCE
      const rulesRes = await db.query(
        `SELECT * FROM alert_rules WHERE project_id = $1 AND enabled = true AND event_type = 'exception'`,
        [projectId]
      );
      if (rulesRes.rows.length === 0) continue;
      const rules = rulesRes.rows;

      // Gather all unique fingerprints and unique windows for this project
      const fingerprints = projectIssuesList.map(i => i.fingerprint);
      const windows = Array.from(new Set(rules.map(r => r.window_minutes)));

      if (fingerprints.length === 0 || windows.length === 0) continue;

      // Build a single query to count occurrences for each fingerprint and each window
      const selects = windows.map(w => `countIf(start_time >= NOW() - INTERVAL ${w} MINUTE) as count_${w}`).join(', ');
      const maxWindow = Math.max(...windows);

      const countQuery = `
        SELECT error_fingerprint as fingerprint, ${selects}
        FROM spans
        WHERE project_id = {projectId:String} 
          AND error_fingerprint IN ({fingerprints:Array(String)})
          AND start_time >= NOW() - INTERVAL {maxWindow:UInt32} MINUTE
        GROUP BY fingerprint
      `;

      const countsByFingerprint: Record<string, Record<number, number>> = {};
      try {
        const chRes = await clickhouse.query({
          query: countQuery,
          query_params: { projectId, fingerprints, maxWindow },
          format: 'JSONEachRow'
        });
        const chRows = await chRes.json<any>();
        
        for (const row of chRows) {
          countsByFingerprint[row.fingerprint] = {};
          for (const w of windows) {
            countsByFingerprint[row.fingerprint][w] = parseInt(row[`count_${w}`] || '0', 10);
          }
        }
      } catch (err: any) {
        console.error(`Failed to bulk query ClickHouse for alert evaluation: ${err.message}`);
        continue; // Skip evaluation if CH is down
      }

      for (const issue of projectIssuesList) {
        const counts = countsByFingerprint[issue.fingerprint] || {};

        for (const rule of rules) {
          if (rule.severity !== 'any' && rule.severity !== issue.severity) continue;

          const count = counts[rule.window_minutes] || 0;

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
            `, [projectId, rule.id, issue.fingerprint]);

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
              projectId,
              rule.id,
              issue.id,
              issue.fingerprint,
              issue.title,
              issue.message,
              issue.severity,
              rule.route_type,
              rule.route_target,
              isCooldown ? 'suppressed' : 'queued'
            ]);

            if (!isCooldown) {
              const alertEvent: AlertEvent = {
                id: eventRes.rows[0].id,
                projectId: projectId,
                title: issue.title,
                message: issue.message,
                severity: issue.severity,
                fingerprint: issue.fingerprint,
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
      }
    }
  } catch (err) {
    console.error('Error during bulk alert evaluation:', err);
  }
}
