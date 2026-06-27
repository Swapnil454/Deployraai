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
  auto_resolve?: boolean;
  channels: AlertChannel[];
}

interface AlertChannel {
  type: 'slack' | 'webhook' | 'pagerduty' | 'linear' | 'jira' | 'status_page';
  url?: string;
  credentialsEncrypted?: string;
}

export async function evaluateAlerts() {
  console.log('Evaluating SLOs and Anomalies...');
  try {
    const slos = await db.query(`SELECT * FROM service_level_objectives`);

    await Promise.all([
      ...slos.rows.map(slo => checkSLOBurnRate(slo)),
    ]);

    const activeProjects = await db.query(`SELECT DISTINCT project_id FROM metrics_minutely WHERE bucket > NOW() - INTERVAL '1 hour'`);
    for (const project of activeProjects.rows) {
      await evaluateAnomalies(project.project_id);
    }
    
    // Evaluate user-defined alert rules
    const rulesRes = await db.query(`SELECT * FROM alert_rules WHERE enabled = true`);
    await Promise.all(rulesRes.rows.map(row => {
      const channels: AlertChannel[] = [{
        type: row.route_type as any,
        url: row.route_target // for status_page, this holds JSON string like {"componentId": "...", "severity": "major"}
      }];
      
      let metric = row.event_type;
      if (metric === 'exception') metric = 'error_rate'; // Map legacy values if any
      
      const rule: AlertRule = {
        id: row.id,
        projectId: row.project_id,
        metric: metric as any,
        operator: 'gt', // We'll assume greater-than for now
        threshold: row.threshold,
        windowMins: row.window_minutes,
        auto_resolve: row.auto_resolve !== false, // default true
        channels
      };
      
      return evaluateRule(rule);
    }));
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
  `, [slo.project_id, 1 - (slo.target_percent / 100)]);

  const { bad_minutes, total_minutes } = lastHour.rows[0];
  if (!total_minutes || total_minutes === '0') return;

  const hourlyBudget = parseInt(total_minutes) * (1 - slo.target_percent / 100);
  if (hourlyBudget <= 0) return;

  const burnRate = parseInt(bad_minutes) / hourlyBudget;

  if (burnRate > 14.4) {
    console.log(`[SLO] Fast burn detected for SLO ${slo.id}: ${burnRate.toFixed(1)}x`);
    const message = `SLO "${slo.metric}" burning at ${burnRate.toFixed(1)}x rate — monthly budget exhausted in ~${(720/burnRate).toFixed(0)}h`;
    
    const rules = await db.query(`SELECT route_type, route_target FROM alert_rules WHERE project_id = $1 AND enabled = true LIMIT 1`, [slo.project_id]);
    const channels: AlertChannel[] = rules.rows.length > 0
      ? [{ type: rules.rows[0].route_type as any, url: rules.rows[0].route_target }]
      : [];
    
    const pseudoRule: AlertRule = {
      id: `slo_${slo.id}`,
      projectId: slo.project_id,
      metric: 'slo_fast_burn',
      operator: 'gt',
      threshold: 14.4,
      windowMins: 60,
      channels
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
  } else if (rule.auto_resolve && rule.channels.some(c => c.type === 'status_page')) {
    // If it's NOT triggered and auto_resolve is enabled, attempt to resolve active status page incidents
    await resolveStatusPageIncident(rule);
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
  // Use alert_events table for cooldown tracking
  const recent = await db.query(
    `SELECT id FROM alert_events WHERE rule_id = $1 AND triggered_at > NOW() - INTERVAL '15 minutes' LIMIT 1`,
    // SLO pseudo rules don't have real UUIDs — use NULL so we skip cooldown for those
    [rule.id.startsWith('slo_') ? null : rule.id]
  );
  if (recent.rows.length > 0) return;

  // Insert alert event (rule_id is NULL for SLO pseudo-alerts)
  await db.query(
    `INSERT INTO alert_events (project_id, rule_id, title, message, severity, route_type, route_target, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued')`,
    [
      rule.projectId,
      rule.id.startsWith('slo_') ? null : rule.id,
      `Alert: ${rule.metric}`,
      customMessage || `${rule.metric} is ${currentValue} (threshold: ${rule.operator} ${rule.threshold})`,
      'warning',
      rule.channels[0]?.type || 'dashboard',
      rule.channels[0]?.url || null
    ]
  );

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
      case 'status_page':
        await fireStatusPageIncident(rule, value, message, channel.url);
        break;
    }
  } catch (err) {
    console.error(`Failed to send alert to ${channel.type}`, err);
  }
}

async function fireStatusPageIncident(rule: AlertRule, value: number, message: string, routeTarget?: string) {
  if (!routeTarget) return;
  try {
    const config = JSON.parse(routeTarget);
    const { componentId, severity } = config;
    
    // Check if there's already an unresolved incident for this rule to prevent spam
    const existing = await db.query(
      `SELECT id FROM incidents WHERE project_id = $1 AND title = $2 AND status != 'resolved' LIMIT 1`,
      [rule.projectId, `Automated Alert: ${rule.metric}`]
    );
    
    if (existing.rows.length > 0) return; // Incident already active
    
    // Create new incident
    const incRes = await db.query(
      `INSERT INTO incidents (project_id, title, status, severity, started_at)
       VALUES ($1, $2, 'investigating', $3, NOW()) RETURNING id`,
      [rule.projectId, `Automated Alert: ${rule.metric}`, severity || 'minor']
    );
    const incidentId = incRes.rows[0].id;
    
    // Add initial message
    await db.query(
      `INSERT INTO incident_updates (incident_id, message, new_status)
       VALUES ($1, $2, 'investigating')`,
      [incidentId, `Anomaly detected: ${message}`]
    );
    
    // Link component
    if (componentId) {
      await db.query(
        `INSERT INTO incident_components (incident_id, component_id) VALUES ($1, $2)`,
        [incidentId, componentId]
      );
      
      // Degrade component status
      const compStatus = severity === 'critical' ? 'major_outage' : (severity === 'major' ? 'partial_outage' : 'degraded');
      await db.query(
        `UPDATE status_page_components SET current_status = $1, updated_at = NOW() WHERE id = $2`,
        [compStatus, componentId]
      );
    }
  } catch (err) {
    console.error("Failed to parse status_page route_target or create incident", err);
  }
}

async function resolveStatusPageIncident(rule: AlertRule) {
  try {
    // Find active automated incidents for this rule
    const active = await db.query(
      `SELECT id FROM incidents WHERE project_id = $1 AND title = $2 AND status != 'resolved'`,
      [rule.projectId, `Automated Alert: ${rule.metric}`]
    );
    
    for (const inc of active.rows) {
      const incidentId = inc.id;
      
      // Mark resolved
      await db.query(
        `UPDATE incidents SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [incidentId]
      );
      
      await db.query(
        `INSERT INTO incident_updates (incident_id, message, new_status)
         VALUES ($1, $2, 'resolved')`,
        [incidentId, `Auto-resolved: ${rule.metric} has returned to normal.`]
      );
      
      // Restore components
      const comps = await db.query(`SELECT component_id FROM incident_components WHERE incident_id = $1`, [incidentId]);
      for (const comp of comps.rows) {
        // Simple logic: if resolved, assume operational. (In a perfect world, we'd check if OTHER incidents still affect this component, but this is fine for now)
        await db.query(
          `UPDATE status_page_components SET current_status = 'operational', updated_at = NOW() WHERE id = $1`,
          [comp.component_id]
        );
      }
    }
  } catch (err) {
    console.error("Failed to auto-resolve status page incident", err);
  }
}

setInterval(evaluateAlerts, 60 * 1000);
evaluateAlerts();
