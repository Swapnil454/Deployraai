import { db } from './db.js';
import { createLinearIssue } from './notifiers/linear.js';
import { createJiraIssue } from './notifiers/jira.js';
import crypto from 'crypto';

// Copying decrypt locally to avoid module resolution issues
function decrypt(encryptedText: string) {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key) throw new Error("CREDENTIAL_ENCRYPTION_KEY is required");
  const [ivHex, authTagHex, encryptedHex] = encryptedText.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

interface AlertRule {
  id: string;
  projectId: string;
  metric: 'error_rate' | 'p99_latency' | 'uptime' | 'request_count' | 'slo_fast_burn';
  operator: 'gt' | 'lt';
  threshold: number;
  windowMins: number;
  channels: AlertChannel[];
}

interface AlertChannel {
  type: 'slack' | 'webhook' | 'pagerduty' | 'linear' | 'jira';
  url?: string;
  credentialsEncrypted?: string;
}

export async function evaluateAlerts() {
  console.log('Evaluating alerts...');
  try {
    const [rules, slos] = await Promise.all([
      db.query(`SELECT id, project_id as "projectId", metric, operator, threshold, window_mins as "windowMins", channels FROM alert_rules WHERE enabled = true`),
      db.query(`SELECT * FROM service_level_objectives`),
    ]);

    await Promise.all([
      ...rules.rows.map(rule => evaluateRule(rule)),
      ...slos.rows.map(slo => checkSLOBurnRate(slo)),
    ]);

    const activeProjects = await db.query(`SELECT DISTINCT project_id FROM metrics_minutely WHERE bucket > NOW() - INTERVAL '1 hour'`);
    for (const project of activeProjects.rows) {
      await evaluateAnomalies(project.project_id);
    }
  } catch (err) {
    console.error('Error evaluating alerts:', err);
  }
}

async function checkSLOBurnRate(slo: any) {
  const lastHour = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE error_count::float / NULLIF(request_count,0) >= $2) as bad_minutes,
      COUNT(*) as total_minutes
    FROM metrics_minutely
    WHERE project_id = $1 AND bucket >= NOW() - INTERVAL '1 hour'
  `, [slo.project_id, 1 - (slo.target_pct / 100)]);

  const { bad_minutes, total_minutes } = lastHour.rows[0];
  if (!total_minutes || total_minutes === '0') return;

  const hourlyBudget = parseInt(total_minutes) * (1 - slo.target_pct / 100);
  if (hourlyBudget <= 0) return;

  const burnRate = parseInt(bad_minutes) / hourlyBudget;

  if (burnRate > 14.4) {
    console.log(`[SLO] Fast burn detected for SLO ${slo.id}: ${burnRate.toFixed(1)}x`);
    const message = `SLO "${slo.name || slo.metric}" burning at ${burnRate.toFixed(1)}x rate — monthly budget exhausted in ~${(720/burnRate).toFixed(0)}h`;
    
    // Find channels configured for this project to notify
    const rules = await db.query(`SELECT channels FROM alert_rules WHERE project_id = $1 LIMIT 1`, [slo.project_id]);
    const channels = rules.rows.length > 0 ? rules.rows[0].channels : [];
    
    const pseudoRule: AlertRule = {
      id: `slo_${slo.id}`,
      projectId: slo.project_id,
      metric: 'slo_fast_burn',
      operator: 'gt',
      threshold: 14.4,
      windowMins: 60,
      channels: channels
    };

    await fireAlert(pseudoRule, burnRate, message);
  }
}

async function evaluateRule(rule: AlertRule) {
  const value = await computeMetric(rule);
  const isTriggered = rule.operator === 'gt'
    ? value > rule.threshold
    : value < rule.threshold;

  if (isTriggered) {
    await fireAlert(rule, value);
  }
}

async function evaluateAnomalies(projectId: string) {
  try {
    const warmup = await db.query(`SELECT COUNT(DISTINCT DATE(bucket)) as days FROM metrics_minutely WHERE project_id = $1 AND bucket > NOW() - INTERVAL '7 days'`, [projectId]);
    if (parseInt(warmup.rows[0].days) < 3) return;

    const baseline = await db.query(`
      WITH bucketed AS (
        SELECT bucket, SUM(error_count)::float / NULLIF(SUM(request_count), 0) as error_rate
        FROM metrics_minutely
        WHERE project_id = $1 AND bucket > NOW() - INTERVAL '4 weeks'
        GROUP BY bucket
      )
      SELECT COALESCE(AVG(error_rate), 0) as avg_rate, COALESCE(STDDEV(error_rate), 0) as stddev_rate
      FROM bucketed
      WHERE EXTRACT(DOW FROM bucket) = EXTRACT(DOW FROM NOW()) AND EXTRACT(HOUR FROM bucket) = EXTRACT(HOUR FROM NOW())
    `, [projectId]);

    const avg = parseFloat(baseline.rows[0]?.avg_rate ?? '0');
    const stddev = parseFloat(baseline.rows[0]?.stddev_rate ?? '0');

    const current = await db.query(`SELECT COALESCE(SUM(error_count)::float / NULLIF(SUM(request_count), 0), 0) as current_rate FROM metrics_minutely WHERE project_id = $1 AND bucket > NOW() - INTERVAL '15 minutes'`, [projectId]);
    const currentRate = parseFloat(current.rows[0]?.current_rate ?? '0');

    if (currentRate > avg + (3 * stddev) && currentRate > 0.05) {
      await fireAnomalyAlert(projectId, currentRate, avg, stddev);
    }
  } catch (err) {}
}

async function fireAnomalyAlert(projectId: string, currentRate: number, avg: number, stddev: number) {}

async function computeMetric(rule: AlertRule): Promise<number> {
  const windowStart = `NOW() - INTERVAL '${rule.windowMins} minutes'`;

  switch (rule.metric) {
    case 'error_rate': {
      const res = await db.query(`SELECT ROUND(100.0 * SUM(error_count) / NULLIF(SUM(request_count), 0), 2) as value FROM metrics_minutely WHERE project_id = $1 AND bucket >= ${windowStart}`, [rule.projectId]);
      return parseFloat(res.rows[0]?.value ?? '0');
    }
    case 'p99_latency': {
      const lat = await db.query(`SELECT PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms) as value FROM spans WHERE project_id = $1 AND start_time >= ${windowStart} AND parent_span_id IS NULL`, [rule.projectId]);
      return parseFloat(lat.rows[0]?.value ?? '0');
    }
    case 'uptime': {
      // Majority-vote consensus: a minute is only considered an outage if >=2 regions report failure.
      const up = await db.query(`
        WITH checks_per_minute AS (
          SELECT date_trunc('minute', checked_at) as minute, 
                 COUNT(*) as total,
                 COUNT(*) FILTER (WHERE status_code >= 400 OR status_code = 0) as failed
          FROM synthetic_checks
          WHERE project_id = $1 AND checked_at >= ${windowStart}
          GROUP BY 1
        )
        SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE failed < 2) / NULLIF(COUNT(*), 0), 2) as value
        FROM checks_per_minute
      `, [rule.projectId]);
      return parseFloat(up.rows[0]?.value ?? '100');
    }
    default:
      return 0;
  }
}

async function fireAlert(rule: AlertRule, currentValue: number, customMessage?: string) {
  const recent = await db.query(`SELECT id FROM alert_firings WHERE rule_id = $1 AND fired_at > NOW() - INTERVAL '15 minutes'`, [rule.id]);
  if (recent.rows.length > 0) return;
  await db.query(`INSERT INTO alert_firings (rule_id, project_id, metric_value) VALUES ($1, $2, $3)`, [rule.id, rule.projectId, currentValue]);
  for (const channel of rule.channels) {
    await sendNotification(channel, rule, currentValue, customMessage);
  }
}

async function sendNotification(channel: AlertChannel, rule: AlertRule, value: number, customMessage?: string) {
  let creds: any = null;
  if (channel.credentialsEncrypted) {
    try {
      creds = JSON.parse(decrypt(channel.credentialsEncrypted));
    } catch (e) {
      console.error("Failed to decrypt channel credentials", e);
    }
  }

  const message = customMessage || `Alert: ${rule.metric} is ${value} (threshold: ${rule.operator} ${rule.threshold})`;

  try {
    switch (channel.type) {
      case 'slack':
        if (channel.url) await fetch(channel.url, { method: 'POST', body: JSON.stringify({ text: message }) }).catch(()=>{});
        break;
      case 'pagerduty':
        if (creds?.routingKey) {
          await fetch('https://events.pagerduty.com/v2/enqueue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              routing_key: creds.routingKey,
              event_action: 'trigger',
              dedup_key: rule.id,
              payload: { summary: message, source: 'tracepilot', severity: 'critical', custom_details: { rule, value } }
            })
          });
        }
        break;
      case 'linear':
        if (creds?.apiKey && creds?.teamId) {
          await createLinearIssue(creds.apiKey, creds.teamId, rule, value);
        }
        break;
      case 'jira':
        if (creds?.domain && creds?.email && creds?.apiToken && creds?.projectKey) {
          await createJiraIssue(creds.domain, creds.email, creds.apiToken, creds.projectKey, rule, value);
        }
        break;
      case 'webhook':
        if (channel.url) await fetch(channel.url, { method: 'POST', body: JSON.stringify({ rule, value, message }) }).catch(()=>{});
        break;
    }
  } catch (err) {
    console.error(`Failed to send alert to ${channel.type}`, err);
  }
}

setInterval(evaluateAlerts, 60 * 1000);
evaluateAlerts();
