import 'dotenv/config';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import { metricsRouter } from './routes/metrics.js';
import { customQueriesRouter } from './routes/custom-queries.js';
import { logsRouter } from './routes/logs.js';
import { tracesRouter } from './routes/traces.js';
import { tracesStreamRouter } from './routes/traces-stream.js';
import { tracesHistogramRouter } from './routes/traces-histogram.js';
import { tracesAnalysisRouter } from './routes/traces-analysis.js';
import { tracesRumRouter } from './routes/traces-rum.js';
import { logsStreamRouter } from './routes/logs-stream.js';
import { publicStatusRouter } from './routes/status.js';
import { sloRouter } from './routes/slo.js';
import { billingRouter } from './routes/billing.js';
import { topologyRouter } from './routes/topology.js';
import { customDashboardsRouter } from './routes/custom-dashboards.js';
import { profilesRouter } from './routes/profiles.js';

const app = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024 // 10MB
});

app.register(cors, {
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
});

app.register(rateLimit, {
  max: 60,
  timeWindow: '1 minute',
  keyGenerator: (req) => {
    return req.ip; // Analytics API rate limit per IP
  }
});

// Routes
app.register(metricsRouter, { prefix: '/metrics' });
app.register(customQueriesRouter, { prefix: '/metrics' });
app.register(logsRouter, { prefix: '/logs' });
app.register(tracesRouter, { prefix: '/traces' });
app.register(tracesStreamRouter, { prefix: '/traces' });
app.register(tracesHistogramRouter, { prefix: '/traces' });
app.register(tracesAnalysisRouter, { prefix: '/analysis' });
app.register(tracesRumRouter, { prefix: '/rum' });
app.register(logsStreamRouter, { prefix: '/logs' });
app.register(publicStatusRouter, { prefix: '/public' });
app.register(sloRouter, { prefix: '/slo' });
app.register(billingRouter, { prefix: '/billing' });
app.register(topologyRouter, { prefix: '/topology' });
app.register(customDashboardsRouter, { prefix: '/custom-dashboards' });
app.register(profilesRouter, { prefix: '/profiles' });

app.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

const start = async () => {
  try {
    // Port 4318 for analytics API, separate from 4317 ingestor
    await app.listen({ port: 4318, host: '0.0.0.0' });
    console.log('Analytics Query API running on port 4318');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
