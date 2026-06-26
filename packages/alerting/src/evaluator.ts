import { db } from './db.js';

interface AlertRule {
  id: string;
  projectId: string;
  metric: 'error_rate' | 'p99_latency' | 'uptime' | 'request_count';
  operator: 'gt' | 'lt';
  threshold: number;
  windowMins: number;
  channels: AlertChannel[];
}

interface AlertChannel {
  type: 'slack' | 'email' | 'webhook' | 'pagerduty' | 'linear';
  url?: string;
  email?: string;
  routingKey?: string; // for PagerDuty
  apiKey?: string;     // for Linear
  teamId?: string;     // for Linear
}

export async function evaluateAlerts() {
  console.log('Evaluating alerts...');
  try {
    const rules = await db.query<AlertRule>(`
      SELECT id, project_id as "projectId", metric, operator, threshold, window_mins as "windowMins", channels
      FROM alert_rules 
      WHERE enabled = true
    `);

    for (const rule of rules.rows) {
      const value = await computeMetric(rule);
      const isTriggered = rule.operator === 'gt'
        ? value > rule.threshold
        : value < rule.threshold;

      if (isTriggered) {
        await fireAlert(rule, value);
      }
    }

    // Evaluate Anomalies for active projects
    const activeProjects = await db.query(`SELECT DISTINCT project_id FROM metrics_minutely WHERE bucket > NOW() - INTERVAL '1 hour'`);
    for (const project of activeProjects.rows) {
      await evaluateAnomalies(project.project_id);
    }
  } catch (err) {
    console.error('Error evaluating alerts:', err);
  }
}

async function evaluateAnomalies(projectId: string) {
  try {
    // 1. Warmup gate: at least 3 distinct days of data in the last 7 days
    const warmup = await db.query(`
      SELECT COUNT(DISTINCT DATE(bucket)) as days
      FROM metrics_minutely
      WHERE project_id = $1 AND bucket > NOW() - INTERVAL '7 days'
    `, [projectId]);
    
    if (parseInt(warmup.rows[0].days) < 3) return;

    // 2. Compute baseline: Hour-of-week average and stddev over last 4 weeks
    const baseline = await db.query(`
      WITH bucketed AS (
        SELECT bucket, SUM(error_count)::float / NULLIF(SUM(request_count), 0) as error_rate
        FROM metrics_minutely
        WHERE project_id = $1 AND bucket > NOW() - INTERVAL '4 weeks'
        GROUP BY bucket
      )
      SELECT 
        COALESCE(AVG(error_rate), 0) as avg_rate, 
        COALESCE(STDDEV(error_rate), 0) as stddev_rate
      FROM bucketed
      WHERE EXTRACT(DOW FROM bucket) = EXTRACT(DOW FROM NOW())
        AND EXTRACT(HOUR FROM bucket) = EXTRACT(HOUR FROM NOW())
    `, [projectId]);

    const avg = parseFloat(baseline.rows[0]?.avg_rate ?? '0');
    const stddev = parseFloat(baseline.rows[0]?.stddev_rate ?? '0');

    // 3. Current error rate (last 15 mins)
    const current = await db.query(`
      SELECT COALESCE(SUM(error_count)::float / NULLIF(SUM(request_count), 0), 0) as current_rate
      FROM metrics_minutely
      WHERE project_id = $1 AND bucket > NOW() - INTERVAL '15 minutes'
    `, [projectId]);

    const currentRate = parseFloat(current.rows[0]?.current_rate ?? '0');

    // 4. Anomaly criteria: current rate > baseline + 3*stddev AND current rate > 5% (noise filter)
    if (currentRate > avg + (3 * stddev) && currentRate > 0.05) {
      await fireAnomalyAlert(projectId, currentRate, avg, stddev);
    }

  } catch (err) {
    console.error(`Error evaluating anomalies for ${projectId}:`, err);
  }
}

async function fireAnomalyAlert(projectId: string, currentRate: number, avg: number, stddev: number) {
  // Prevent duplicate anomaly alerts — check if we fired an anomaly alert for this project in last 60 mins
  // Since anomalies don't have a specific rule_id, we use a placeholder rule_id (like an all-zero UUID) or check the message.
  // Wait, alert_firings requires a rule_id. Let's find an existing rule or just use a synthetic rule ID.
  // Actually, anomaly alerts are system level. Let's see if we have a specific rule.
  // Since schema expects a rule_id, we can fetch an enabled error_rate rule for this project, OR we can just skip if there are no channels.
  // For simplicity, we find the first alert rule for the project to get channels.
  const rule = await db.query<AlertRule>(`SELECT * FROM alert_rules WHERE project_id = $1 LIMIT 1`, [projectId]);
  if (rule.rowCount === 0) return;

  const recent = await db.query(`
    SELECT id FROM alert_firings
    WHERE rule_id = $1 AND fired_at > NOW() - INTERVAL '60 minutes' AND metric_value = $2
  `, [rule.rows[0].id, -1]); // use metric_value = -1 as a special marker for anomaly

  if (recent.rows.length > 0) return;

  await db.query(`
    INSERT INTO alert_firings (rule_id, project_id, metric_value)
    VALUES ($1, $2, $3)
  `, [rule.rows[0].id, projectId, -1]);

  for (const channel of rule.rows[0].channels) {
    const message = `🚨 Anomaly Detected! Error rate is ${(currentRate*100).toFixed(1)}% (Baseline: ${(avg*100).toFixed(1)}%, StdDev: ${(stddev*100).toFixed(1)}%)`;
    console.log(`Sending anomaly notification to ${channel.type}: ${message}`);
    
    // Stub notification logic for anomaly (similar to standard alerts)
    if (channel.type === 'slack' && channel.url) {
      await fetch(channel.url, { method: 'POST', body: JSON.stringify({ text: message }) }).catch(() => {});
    }
  }
}

async function computeMetric(rule: AlertRule): Promise<number> {
  const windowStart = `NOW() - INTERVAL '${rule.windowMins} minutes'`;

  switch (rule.metric) {
    case 'error_rate': {
      const res = await db.query(`
        SELECT ROUND(100.0 * SUM(error_count) / NULLIF(SUM(request_count), 0), 2) as value
        FROM metrics_minutely
        WHERE project_id = $1 AND bucket >= ${windowStart}
      `, [rule.projectId]);
      return parseFloat(res.rows[0]?.value ?? '0');
    }

    case 'p99_latency': {
      const lat = await db.query(`
        SELECT PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms) as value
        FROM spans
        WHERE project_id = $1 AND start_time >= ${windowStart}
          AND parent_span_id IS NULL
      `, [rule.projectId]);
      return parseFloat(lat.rows[0]?.value ?? '0');
    }

    case 'uptime': {
      const up = await db.query(`
        SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 399) / NULLIF(COUNT(*), 0), 2) as value
        FROM synthetic_checks
        WHERE project_id = $1 AND checked_at >= ${windowStart}
      `, [rule.projectId]);
      return parseFloat(up.rows[0]?.value ?? '100');
    }

    default:
      return 0;
  }
}

async function fireAlert(rule: AlertRule, currentValue: number) {
  // Prevent duplicate alerts — check if we fired this alert in last 15 mins
  const recent = await db.query(`
    SELECT id FROM alert_firings
    WHERE rule_id = $1 AND fired_at > NOW() - INTERVAL '15 minutes'
  `, [rule.id]);

  if (recent.rows.length > 0) return; // already alerted recently

  await db.query(`
    INSERT INTO alert_firings (rule_id, project_id, metric_value)
    VALUES ($1, $2, $3)
  `, [rule.id, rule.projectId, currentValue]);

  for (const channel of rule.channels) {
    await sendNotification(channel, rule, currentValue);
  }
}

async function sendNotification(
  channel: AlertChannel,
  rule: AlertRule,
  value: number
) {
  const message = `Alert: ${rule.metric} is ${value} (threshold: ${rule.operator} ${rule.threshold})`;
  console.log(`Sending alert notification to ${channel.type}: ${message}`);

  try {
    if (channel.type === 'slack') {
      await fetch(channel.url!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
    }

    if (channel.type === 'webhook') {
      await fetch(channel.url!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule, value, message, firedAt: new Date() }),
      });
    }

    if (channel.type === 'pagerduty') {
      await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routing_key: channel.routingKey,
          event_action: 'trigger',
          dedup_key: rule.id, // Group all alerts for this rule into a single incident
          payload: {
            summary: message,
            source: 'tracepilot',
            severity: 'critical',
            custom_details: { rule, value }
          }
        })
      });
    }

    if (channel.type === 'linear') {
      const query = `
        mutation IssueCreate($teamId: String!, $title: String!, $description: String!) {
          issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
            success
          }
        }
      `;
      await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': channel.apiKey!
        },
        body: JSON.stringify({
          query,
          variables: {
            teamId: channel.teamId,
            title: `Alert: ${rule.metric} breached threshold`,
            description: message + `\n\nMetric: ${rule.metric}\nValue: ${value}\nThreshold: ${rule.threshold}`
          }
        })
      });
    }
  } catch (err) {
    console.error(`Failed to send alert to ${channel.type}`, err);
  }
}

// Run every minute
setInterval(evaluateAlerts, 60 * 1000);
evaluateAlerts(); // run immediately on start
