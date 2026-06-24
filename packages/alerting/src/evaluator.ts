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
  type: 'slack' | 'email' | 'webhook';
  url?: string;
  email?: string;
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
  } catch (err) {
    console.error('Error evaluating alerts:', err);
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
  } catch (err) {
    console.error(`Failed to send alert to ${channel.type}`, err);
  }
}

// Run every minute
setInterval(evaluateAlerts, 60 * 1000);
evaluateAlerts(); // run immediately on start
