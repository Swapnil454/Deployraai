import cron from 'node-cron';
import pg from 'pg';
import { runAllMonitors } from './services/monitoring.service.js';
import DomainSetup from './models/DomainSetup.js';
import { verifyDomainLogic } from './controllers/domain.controller.js';

import WorkflowRun from './models/WorkflowRun.js';

const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL });
import { triggerWorkflow } from './services/workflow.service.js';

let monitorCronJob    = null;
let domainHealthCronJob = null;
let workflowAwakenerJob = null;
let dataRetentionCronJob = null;

export const initCron = () => {
  if (monitorCronJob && domainHealthCronJob && workflowAwakenerJob && dataRetentionCronJob) return;

  // ── 0. Data Retention Cleanup — every day at 00:00 ─────────────────────────
  if (!dataRetentionCronJob) {
    dataRetentionCronJob = cron.schedule('0 0 * * *', async () => {
      console.log('[Cron:data-retention] Running 30-day data cleanup...');
      try {
        const INGESTOR_API_URL = process.env.INGESTOR_API_URL || 'http://localhost:4317';
        const ADMIN_SECRET = process.env.ADMIN_SECRET || 'dev-admin-secret';
        
        // Using dynamic import of node-fetch if global fetch is not available, 
        // but Node 18+ has global fetch so we'll use that.
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
      }
    });
  }

  // ── 1. Uptime monitor — every 5 minutes ───────────────────────────────────
  if (!monitorCronJob) {
    monitorCronJob = cron.schedule('*/5 * * * *', async () => {
      console.log('[Cron:monitors] Running all uptime monitors...');
      try {
        await runAllMonitors();
        console.log('[Cron:monitors] Finished.');
      } catch (error) {
        console.error('[Cron:monitors] Error:', error);
      }
    });
  }

  // ── 2. Domain health — every 5 minutes ────────────────────────────────────
  // Re-verifies all active/partially_active/degraded/pending_dns domains.
  // Transitions to "degraded" if DNS records are gone, recovers to "active" if they return.
  if (!domainHealthCronJob) {
    domainHealthCronJob = cron.schedule('*/5 * * * *', async () => {
      console.log('[Cron:domains] Running domain health checks...');
      try {
        const domains = await DomainSetup.find({
          status: { $in: ['active', 'partially_active', 'degraded'] },
        });

        console.log(`[Cron:domains] Checking ${domains.length} domain(s)...`);

        // Process sequentially to avoid hammering provider APIs
        for (const domain of domains) {
          try {
            await verifyDomainLogic(domain, { fromCron: true });
          } catch (err) {
            console.error(`[Cron:domains] Error checking ${domain.rootDomain}:`, err.message);
          }
        }

        console.log('[Cron:domains] Finished domain health checks.');
      } catch (error) {
        console.error('[Cron:domains] Fatal error in domain health cron:', error);
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
    try {
      console.log('[Cron:slo] Running daily SLO burn rate calculations...');
      const slos = await db.query('SELECT * FROM service_level_objectives');

      for (const slo of slos.rows) {
        const windowStart = new Date();
        windowStart.setDate(windowStart.getDate() - slo.window_days);

        // Count good minutes vs total minutes in the window
        const result = await db.query(`
          SELECT
            COUNT(*) FILTER (
              WHERE CASE
                WHEN $3 = 'availability' THEN
                  -- good = no errors in this minute
                  (error_count::float / NULLIF(request_count, 0)) < 0.001
                WHEN $3 = 'latency_p99' THEN
                  p99_duration_ms < $4
              END
            ) as good_minutes,
            COUNT(*) as total_minutes
          FROM metrics_minutely
          WHERE project_id = $1 AND bucket >= $2
        `, [slo.project_id, windowStart, slo.metric, slo.latency_ms]);

        const { good_minutes, total_minutes } = result.rows[0];
        const error_budget_total = total_minutes * (1 - slo.target_pct / 100);
        const bad_minutes = total_minutes - good_minutes;
        const budget_consumed = (bad_minutes / error_budget_total) * 100;
        const burn_rate = bad_minutes / (total_minutes * (1 - slo.target_pct / 100));

        await db.query(`
          INSERT INTO slo_burn_rate_daily (slo_id, day, good_minutes, total_minutes, budget_consumed, burn_rate)
          VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
          ON CONFLICT (slo_id, day) DO UPDATE SET
            good_minutes = EXCLUDED.good_minutes,
            total_minutes = EXCLUDED.total_minutes,
            budget_consumed = EXCLUDED.budget_consumed,
            burn_rate = EXCLUDED.burn_rate
        `, [slo.id, good_minutes, total_minutes, budget_consumed, burn_rate]);
      }
      console.log('[Cron:slo] Finished SLO calculations.');
    } catch (error) {
      console.error('[Cron:slo] Fatal error in SLO calculations:', error);
    }
  });

  console.log('[Cron] Initialized schedulers: monitors (*/5 min), domain-health (*/5 min), workflows (* * * * *), slo (0 0 * * *)');
};
