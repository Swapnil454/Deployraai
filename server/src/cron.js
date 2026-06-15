import cron from 'node-cron';
import { runAllMonitors } from './services/monitoring.service.js';
import DomainSetup from './models/DomainSetup.js';
import { verifyDomainLogic } from './controllers/domain.controller.js';

let monitorCronJob    = null;
let domainHealthCronJob = null;

export const initCron = () => {
  if (monitorCronJob && domainHealthCronJob) return;

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
  // Re-verifies all active/partially_active/degraded domains.
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

  console.log('[Cron] Initialized schedulers: monitors (*/5 min), domain-health (*/5 min)');
};
