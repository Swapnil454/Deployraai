import cron from 'node-cron';
import { runAllMonitors } from './services/monitoring.service.js';

let cronJob = null;

export const initCron = () => {
  if (cronJob) return;
  
  // Run every 5 minutes
  cronJob = cron.schedule('*/5 * * * *', async () => {
    console.log('[Cron] Running all monitors...');
    try {
      await runAllMonitors();
      console.log('[Cron] Finished running monitors.');
    } catch (error) {
      console.error('[Cron] Error running monitors:', error);
    }
  });
  
  console.log('[Cron] Initialized node-cron scheduler (*/5 * * * *)');
};
