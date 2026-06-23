import cron from 'node-cron';
import { runAllMonitors } from './services/monitoring.service.js';
import DomainSetup from './models/DomainSetup.js';
import { verifyDomainLogic } from './controllers/domain.controller.js';

import WorkflowRun from './models/WorkflowRun.js';
import { triggerWorkflow } from './services/workflow.service.js';

let monitorCronJob    = null;
let domainHealthCronJob = null;
let workflowAwakenerJob = null;

export const initCron = () => {
  if (monitorCronJob && domainHealthCronJob && workflowAwakenerJob) return;

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

  console.log('[Cron] Initialized schedulers: monitors (*/5 min), domain-health (*/5 min), workflows (* * * * *)');
};
