import { db } from './db.js';
import { clickhouse } from './clickhouse.js';
import { createLinearIssue } from './notifiers/linear.js';
import { createJiraIssue } from './notifiers/jira.js';
import { validateWebhookUrl } from './utils/webhook-validator.js';
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

// Utility to split array into chunks
function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

let isEvaluating = false;

export async function evaluateAlerts() {
  if (isEvaluating) {
    console.log('[AlertEvaluator] Previous evaluation still running, skipping this interval.');
    return;
  }
  isEvaluating = true;
  console.log('Evaluating SLOs and Anomalies...');
  try {
    // 1. Evaluate SLOs sequentially with pagination
    let sloLastId = '00000000-0000-0000-0000-000000000000';
    let sloHasMore = true;
    while (sloHasMore) {
      const slos = await db.query(`SELECT * FROM service_level_objectives WHERE id > $1 ORDER BY id ASC LIMIT 500`, [sloLastId]);
      if (slos.rows.length === 0) {
        sloHasMore = false;
        break;
      }
      sloLastId = slos.rows[slos.rows.length - 1].id;
      
      for (const slo of slos.rows) {
        await checkSLOBurnRate(slo);
      }
    }

    // 2. Evaluate Anomalies
    const activeProjectsRes = await clickhouse.query({
      query: `SELECT DISTINCT project_id FROM metrics_minutely_mv WHERE bucket > now() - INTERVAL 1 HOUR`,
      format: 'JSONEachRow'
    });
    const activeProjectsData = await activeProjectsRes.json<{project_id: string}>();
    const activeProjectIds = activeProjectsData.map(r => r.project_id);
    const chunks = chunkArray(activeProjectIds, 100);
    
    for (const chunk of chunks) {
      await evaluateAnomaliesChunk(chunk);
    }
    
    // 3. Evaluate User-Defined Alert Rules sequentially with pagination
    let ruleLastId = '00000000-0000-0000-0000-000000000000';
    let ruleHasMore = true;
    while (ruleHasMore) {
      const rulesRes = await db.query(`SELECT * FROM alert_rules WHERE enabled = true AND id > $1 ORDER BY id ASC LIMIT 500`, [ruleLastId]);
      if (rulesRes.rows.length === 0) {
        ruleHasMore = false;
        break;
      }
      ruleLastId = rulesRes.rows[rulesRes.rows.length - 1].id;

      for (const row of rulesRes.rows) {
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
        
        await evaluateRule(rule);
      }
    }
  } catch (err) {
    console.error('Error evaluating alerts:', err);
  } finally {
    isEvaluating = false;
  }
}

async function checkSLOBurnRate(slo: any) {
  const lastHourRes = await clickhouse.query({
    query: `
      SELECT
        countIf(error_count / nullIf(request_count, 0) >= {errorThreshold: Float64}) as bad_minutes,
        count() as total_minutes
      FROM metrics_minutely_mv
      WHERE project_id = {projectId: String} AND bucket >= now() - INTERVAL 1 HOUR
    `,
    query_params: { projectId: slo.project_id, errorThreshold: 1 - (slo.target_percent / 100) },
    format: 'JSONEachRow'
  });

  const rows = await lastHourRes.json<{bad_minutes: string, total_minutes: string}>();
  if (rows.length === 0) return;
  const { bad_minutes, total_minutes } = rows[0];

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

interface BaselineCacheEntry {
  avg: number;
  stddev: number;
  calculatedHour: number;
}
const anomalyBaselineCache = new Map<string, BaselineCacheEntry>();
let lastCacheHour = -1;

async function evaluateAnomaliesChunk(projectIds: string[]) {
  try {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentDow = now.getUTCDay();
    
    if (lastCacheHour !== currentHour) {
      anomalyBaselineCache.clear();
      lastCacheHour = currentHour;
    }

    const uncachedIds: string[] = [];
    const baselines: Record<string, {avg: number, stddev: number}> = {};

    for (const projectId of projectIds) {
      const cacheKey = `${projectId}-${currentDow}-${currentHour}`;
      const cached = anomalyBaselineCache.get(cacheKey);
      if (cached) {
        baselines[projectId] = { avg: cached.avg, stddev: cached.stddev };
      } else {
        uncachedIds.push(projectId);
      }
    }

    if (uncachedIds.length > 0) {
      console.log(`[AlertEvaluator] Calculating anomaly baseline for ${uncachedIds.length} projects (cache miss)`);
      try {
        const baselineRes = await clickhouse.query({
          query: `
            WITH bucketed AS (
              SELECT project_id, bucket, sum(error_count) / nullIf(sum(request_count), 0) as error_rate
              FROM metrics_minutely_mv
              WHERE project_id IN ({uncachedIds: Array(String)}) AND bucket > now() - INTERVAL 1 WEEK
              GROUP BY project_id, bucket
            )
            SELECT project_id, coalesce(avg(error_rate), 0) as avg_rate, coalesce(stddevPop(error_rate), 0) as stddev_rate
            FROM bucketed
            WHERE toDayOfWeek(bucket) = toDayOfWeek(now()) AND toHour(bucket) = toHour(now())
            GROUP BY project_id
          `,
          query_params: { uncachedIds },
          format: 'JSONEachRow'
        });

        const rows = await baselineRes.json<{project_id: string, avg_rate: string, stddev_rate: string}>();

        for (const row of rows) {
          const projectId = row.project_id;
          const avg = parseFloat(row.avg_rate);
          const stddev = parseFloat(row.stddev_rate);
          
          baselines[projectId] = { avg, stddev };
          anomalyBaselineCache.set(`${projectId}-${currentDow}-${currentHour}`, { avg, stddev, calculatedHour: currentHour });
        }
      } catch (err) {
        console.error('Failed to calculate baseline from ClickHouse', err);
      }

      // Default for empty results
      for (const projectId of uncachedIds) {
        if (!baselines[projectId]) {
          baselines[projectId] = { avg: 0, stddev: 0 };
          anomalyBaselineCache.set(`${projectId}-${currentDow}-${currentHour}`, { avg: 0, stddev: 0, calculatedHour: currentHour });
        }
      }
    }

    const currentRes = await clickhouse.query({
      query: `
        SELECT project_id, coalesce(sum(error_count) / nullIf(sum(request_count), 0), 0) as current_rate 
        FROM metrics_minutely_mv 
        WHERE project_id IN ({projectIds: Array(String)}) AND bucket > now() - INTERVAL 15 MINUTE
        GROUP BY project_id
      `,
      query_params: { projectIds },
      format: 'JSONEachRow'
    });
    
    const currentRows = await currentRes.json<{project_id: string, current_rate: string}>();

    for (const row of currentRows) {
      const projectId = row.project_id;
      const currentRate = parseFloat(row.current_rate);
      const baseline = baselines[projectId];

      if (baseline && currentRate > baseline.avg + (3 * baseline.stddev) && currentRate > 0.05) {
        await fireAnomalyAlert(projectId, currentRate, baseline.avg, baseline.stddev);
      }
    }
  } catch (err) {
    console.error('Error evaluating anomalies chunk', err);
  }
}

async function fireAnomalyAlert(projectId: string, currentRate: number, avg: number, stddev: number) {}

async function computeMetric(rule: AlertRule): Promise<number> {
  // Sanitize windowMins: ensure it is a safe positive integer before any string interpolation.
  // Although alert_rules has a DB CHECK constraint, we defensively validate here.
  const safeWindowMins = Math.max(1, Math.trunc(Number(rule.windowMins))) || 15;

  switch (rule.metric) {
    case 'error_rate': {
      try {
        const res = await clickhouse.query({
          query: `SELECT toString(round(100.0 * sum(error_count) / nullIf(sum(request_count), 0), 2)) as value FROM metrics_minutely_mv WHERE project_id = {projectId: String} AND bucket >= now() - INTERVAL ${safeWindowMins} MINUTE`,
          query_params: { projectId: rule.projectId },
          format: 'JSONEachRow'
        }).then(r => r.json<{value: string}>());
        return parseFloat(res[0]?.value ?? '0');
      } catch (err) {
        console.error("Failed to fetch error_rate from ClickHouse", err);
        return 0;
      }
    }
    case 'p99_latency': {
      try {
        const lat = await clickhouse.query({
          query: `SELECT toString(quantile(0.99)(duration_ms)) as value FROM spans WHERE project_id = {projectId: String} AND start_time >= now() - INTERVAL ${safeWindowMins} MINUTE AND parent_span_id = ''`,
          query_params: { projectId: rule.projectId },
          format: 'JSONEachRow'
        }).then(r => r.json<{value: string}>());
        return parseFloat(lat[0]?.value ?? '0');
      } catch (err) {
        console.error("Failed to fetch p99_latency from ClickHouse", err);
        return 0;
      }
    }
    case 'uptime': {
      // Majority-vote consensus: a minute is only considered an outage if >=2 regions report failure.
      const windowStart = `NOW() - INTERVAL '${safeWindowMins} minutes'`;
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

  await Promise.allSettled(
    rule.channels.map(channel => sendNotification(channel, rule, currentValue, customMessage))
  );
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
        if (channel.url) {
          const safeIp = await validateWebhookUrl(channel.url);
          const url = new URL(channel.url);
          const originalHost = url.hostname;
          url.hostname = safeIp;
          await fetch(url.toString(), { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Host': originalHost },
            body: JSON.stringify({ text: message }), 
            signal: AbortSignal.timeout(5000),
            redirect: 'manual'
          }).catch(()=>{});
        }
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
            }),
            signal: AbortSignal.timeout(5000)
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
        if (channel.url) {
          const safeIp = await validateWebhookUrl(channel.url);
          const url = new URL(channel.url);
          const originalHost = url.hostname;
          url.hostname = safeIp;
          await fetch(url.toString(), { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Host': originalHost },
            body: JSON.stringify({ rule, value, message }), 
            signal: AbortSignal.timeout(5000),
            redirect: 'manual'
          }).catch(()=>{});
        }
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
