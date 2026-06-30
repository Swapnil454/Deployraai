import cron from 'node-cron';
import pg from 'pg';
import { runAllMonitors } from './services/monitoring.service.js';
import DomainSetup from './models/DomainSetup.js';
import { verifyDomainLogic } from './controllers/domain.controller.js';

import WorkflowRun from './models/WorkflowRun.js';
import Project from './models/Project.js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');

const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL });
import { triggerWorkflow } from './services/workflow.service.js';
import { clickhouse } from './config/clickhouse.js';

let monitorCronJob    = null;
let domainHealthCronJob = null;
let workflowAwakenerJob = null;
let dataRetentionCronJob = null;

export const initCron = () => {
  if (monitorCronJob && domainHealthCronJob && workflowAwakenerJob && dataRetentionCronJob) return;

  // ── 0. Data Retention Cleanup — every day at 00:00 ─────────────────────────
  if (!dataRetentionCronJob) {
    dataRetentionCronJob = cron.schedule('0 0 * * *', async () => {
      let client;
      let lockAcquired = false;
      try {
        client = await db.connect();
        const { rows } = await client.query('SELECT pg_try_advisory_lock(1000) as locked');
        if (!rows[0].locked) return; // Another instance has the lock — still releases client in finally
        lockAcquired = true;

        console.log('[Cron:data-retention] Running 30-day data cleanup...');
        const INGESTOR_API_URL = process.env.INGESTOR_API_URL || 'http://localhost:4317';
        const ADMIN_SECRET = process.env.ADMIN_SECRET || 'dev-admin-secret';
        
        const res = await fetch(`${INGESTOR_API_URL}/admin/cleanup`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${ADMIN_SECRET}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          console.log(`[Cron:data-retention] Cleanup success: ${data.spansDeleted} spans, ${data.logsDeleted} logs deleted.`);
        } else {
          console.error(`[Cron:data-retention] Cleanup failed with status ${res.status}`);
        }
      } catch (error) {
        console.error('[Cron:data-retention] Error:', error);
      } finally {
        if (client) {
          if (lockAcquired) await client.query('SELECT pg_advisory_unlock(1000)');
          client.release();
        }
      }
    });
  }

  // ── 1. Uptime monitor — every 5 minutes ───────────────────────────────────
  if (!monitorCronJob) {
    monitorCronJob = cron.schedule('*/5 * * * *', async () => {
      let client;
      let lockAcquired = false;
      try {
        client = await db.connect();
        const { rows } = await client.query('SELECT pg_try_advisory_lock(1001) as locked');
        if (!rows[0].locked) return; // Another instance has the lock — still releases client in finally
        lockAcquired = true;

        console.log('[Cron:monitors] Running all uptime monitors...');
        await runAllMonitors();
        console.log('[Cron:monitors] Finished.');
      } catch (error) {
        console.error('[Cron:monitors] Error:', error);
      } finally {
        if (client) {
          if (lockAcquired) await client.query('SELECT pg_advisory_unlock(1001)');
          client.release();
        }
      }
    });
  }

  // ── 2. Domain health — every 5 minutes ────────────────────────────────────
  // Re-verifies all active/partially_active/degraded/pending_dns domains.
  // Transitions to "degraded" if DNS records are gone, recovers to "active" if they return.
  if (!domainHealthCronJob) {
    domainHealthCronJob = cron.schedule('*/5 * * * *', async () => {
      let client;
      let lockAcquired = false;
      try {
        client = await db.connect();
        const { rows } = await client.query('SELECT pg_try_advisory_lock(1002) as locked');
        if (!rows[0].locked) return; // Another instance has the lock — still releases client in finally
        lockAcquired = true;

        console.log('[Cron:domains] Running domain health checks...');
        const domainCursor = DomainSetup.find({
          status: { $in: ['active', 'partially_active', 'degraded'] },
        }).cursor();

        let count = 0;
        // Process sequentially to avoid hammering provider APIs
        for await (const domain of domainCursor) {
          count++;
          try {
            await verifyDomainLogic(domain, { fromCron: true });
          } catch (err) {
            console.error(`[Cron:domains] Error checking ${domain.rootDomain}:`, err.message);
          }
        }
        console.log(`[Cron:domains] Checked ${count} domain(s).`);

        console.log('[Cron:domains] Finished domain health checks.');
      } catch (error) {
        console.error('[Cron:domains] Fatal error in domain health cron:', error);
      } finally {
        if (client) {
          if (lockAcquired) await client.query('SELECT pg_advisory_unlock(1002)');
          client.release();
        }
      }
    });
  }

  // ── 3. Workflow Awakener — every 1 minute ─────────────────────────────────
  if (!workflowAwakenerJob) {
    workflowAwakenerJob = cron.schedule('* * * * *', async () => {
      // console.log('[Cron:workflows] Checking for sleeping workflows...');
      try {
        const now = new Date();
        const staleLockBefore = new Date(Date.now() - 10 * 60 * 1000); // 10 mins
        const lockOwner = `${process.pid}-${process.env.HOSTNAME || 'worker'}`;

        // Keep finding sleeping workflows one by one and locking them
        let processedCount = 0;
        while (true) {
          const run = await WorkflowRun.findOneAndUpdate(
            {
              status: 'sleeping',
              resumeAt: { $lte: now },
              $or: [
                { lockedAt: null },
                { lockedAt: { $lte: staleLockBefore } }
              ]
            },
            {
              $set: {
                status: 'running',
                lockedAt: now,
                lockOwner
              }
            },
            { returnDocument: 'after' } // Return the locked document
          );

          if (!run) {
            break; // No more sleeping workflows to awaken
          }

          processedCount++;
          // Trigger it in the background, we don't await so we can keep pulling
          triggerWorkflow(run.projectId, run.workflowName, run.payload, run._id).catch(err => {
            console.error(`[Cron:workflows] Error resuming workflow ${run._id}:`, err);
          });
        }

        if (processedCount > 0) {
          console.log(`[Cron:workflows] Woke up ${processedCount} workflow(s).`);
        }
      } catch (error) {
        console.error('[Cron:workflows] Fatal error in awakener:', error);
      }
    });
  }

  // ── 4. SLO Burn Rate Daily — every day at 00:00 ────────────────────────────
  cron.schedule('0 0 * * *', async () => {
    let client;
    let lockAcquired = false;
    try {
      client = await db.connect();
      const { rows: lockRows } = await client.query('SELECT pg_try_advisory_lock(1003) as locked');
      if (!lockRows[0].locked) return; // Another instance has the lock — still releases client in finally
      lockAcquired = true;

      console.log('[Cron:slo] Running daily SLO burn rate calculations...');
      let lastId = '00000000-0000-0000-0000-000000000000';
      while (true) {
        const slos = await client.query('SELECT * FROM service_level_objectives WHERE id > $1 ORDER BY id ASC LIMIT 500', [lastId]);
        if (slos.rows.length === 0) break;
        lastId = slos.rows[slos.rows.length - 1].id;

        for (const slo of slos.rows) {
          const windowStart = new Date();
          windowStart.setDate(windowStart.getDate() - slo.window_days);

          // Count good minutes vs total minutes in the window from ClickHouse
          const result = await clickhouse.query({
            query: `
              SELECT
                countIf(
                  CASE
                    WHEN {metric: String} = 'availability' THEN
                      -- good = no errors in this minute
                      (error_count / nullIf(request_count, 0)) < 0.001
                    WHEN {metric: String} = 'latency_p99' THEN
                      p99_duration_ms < {latencyMs: UInt32}
                    ELSE 1
                  END
                ) as good_minutes,
                count() as total_minutes
              FROM metrics_minutely_mv
              WHERE project_id = {projectId: String} AND bucket >= {windowStart: DateTime}
            `,
            query_params: {
              projectId: slo.project_id,
              windowStart: windowStart.getTime(),
              metric: slo.metric,
              latencyMs: slo.latency_ms || 200
            },
            format: 'JSONEachRow'
          });

          const rows = await result.json();
          if (rows.length === 0) continue;
          
          const { good_minutes, total_minutes } = rows[0];
          const error_budget_total = total_minutes * (1 - slo.target_pct / 100);
          const bad_minutes = total_minutes - good_minutes;
          const budget_consumed = (bad_minutes / error_budget_total) * 100;
          const burn_rate = bad_minutes / (total_minutes * (1 - slo.target_pct / 100));

          await client.query(`
            INSERT INTO slo_burn_rate_daily (slo_id, day, good_minutes, total_minutes, budget_consumed, burn_rate)
            VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
            ON CONFLICT (slo_id, day) DO UPDATE SET
              good_minutes = EXCLUDED.good_minutes,
              total_minutes = EXCLUDED.total_minutes,
              budget_consumed = EXCLUDED.budget_consumed,
              burn_rate = EXCLUDED.burn_rate
          `, [slo.id, good_minutes, total_minutes, budget_consumed, burn_rate]);
        }
      }
      console.log('[Cron:slo] Finished SLO calculations.');
    } catch (error) {
      console.error('[Cron:slo] Fatal error in SLO calculations:', error);
    } finally {
      if (client) {
        if (lockAcquired) await client.query('SELECT pg_advisory_unlock(1003)');
        client.release();
      }
    }
  });

  // ── 5. Billing Aggregator — every day at 01:00 ─────────────────────────────
  cron.schedule('0 1 * * *', async () => {
    let client;
    let lockAcquired = false;
    try {
      client = await db.connect();
      const { rows } = await client.query('SELECT pg_try_advisory_lock(1004) as locked');
      if (!rows[0].locked) return; // Another instance has the lock — still releases client in finally
      lockAcquired = true;

      console.log('[Cron:billing] Running daily billing aggregator...');
      const projectCursor = Project.find({ 
        stripeSubscriptionItemId: { $exists: true },
        billingStatus: 'active'
      }).cursor();

      let count = 0;
      for await (const project of projectCursor) {
        count++;
        const result = await clickhouse.query({
          query: `
            SELECT count() as span_count FROM spans
            WHERE project_id = {projectId: String}
              AND start_time >= date_trunc('day', now() - INTERVAL 1 DAY)
              AND start_time < date_trunc('day', now())
          `,
          query_params: { projectId: project._id.toString() },
          format: 'JSONEachRow'
        });
        
        const rowsQuery = await result.json();
        const spanCount = parseInt(rowsQuery[0]?.span_count || '0', 10);
        if (spanCount === 0) continue;

        await stripe.subscriptionItems.createUsageRecord(
          project.stripeSubscriptionItemId,
          {
            quantity: spanCount,
            timestamp: Math.floor(Date.now() / 1000),
            action: 'increment',
          }
        );
      }
      console.log(`[Cron:billing] Finished billing aggregator for ${count} projects.`);
    } catch (error) {
      console.error('[Cron:billing] Fatal error in billing aggregator:', error);
    } finally {
      if (client) {
        if (lockAcquired) await client.query('SELECT pg_advisory_unlock(1004)');
        client.release();
      }
    }
  });

  console.log('[Cron] Initialized schedulers: monitors (*/5 min), domain-health (*/5 min), workflows (* * * * *), slo (0 0 * * *), billing (0 1 * * *)');
};
