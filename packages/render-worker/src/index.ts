import express from 'express';
// We import the exported functions directly from the built JS files since they are type="module"
// @ts-ignore
import { evaluateAlerts } from '@swapnil454/alerting/dist/evaluator.js';
// @ts-ignore
import { runHealthChecks } from '@swapnil454/synthetic-checker/dist/checker.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Health endpoint for Render Web Service & Keep-Alive Ping
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
app.get('/health-1', (req, res) => { res.status(200).json({ status: 'ok' }); });
app.get('/health-2', (req, res) => { res.status(200).json({ status: 'ok' }); });
app.get('/health-3', (req, res) => { res.status(200).json({ status: 'ok' }); });

app.listen(PORT, () => {
  console.log(`Render Worker Health server listening on port ${PORT}`);
});

// Run both tasks every 5 minutes (300 seconds)
const INTERVAL_MS = 5 * 60 * 1000;

setInterval(() => {
  evaluateAlerts().catch((err: any) => console.error('[Render Worker] evaluateAlerts error:', err));
}, INTERVAL_MS);

setInterval(() => {
  runHealthChecks().catch((err: any) => console.error('[Render Worker] runHealthChecks error:', err));
}, INTERVAL_MS);

// Run them both immediately on startup as well
evaluateAlerts().catch((err: any) => console.error('[Render Worker] Initial evaluateAlerts error:', err));
runHealthChecks().catch((err: any) => console.error('[Render Worker] Initial runHealthChecks error:', err));

// Global unhandled error protection to prevent the free service from crashing completely
process.on('unhandledRejection', (reason: any) => {
  console.error('[Render Worker] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err: any) => {
  console.error('[Render Worker] Uncaught Exception:', err);
});
