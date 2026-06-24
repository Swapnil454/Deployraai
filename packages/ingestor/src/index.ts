import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { tracesRouter } from './routes/traces.js';
import { logsRouter } from './routes/logs.js';
import { edgeSpansRouter } from './routes/edge-spans.js';
import { adminRouter } from './routes/admin.js';

const app = Fastify({
  logger: true,
  // Trust X-Forwarded-For — ingestor is behind a load balancer
  trustProxy: true,
});

app.register(rateLimit, {
  max: 1000,
  timeWindow: '1 second',
  keyGenerator: (req) => {
    // If authenticated via token, rate limit by token (project ID)
    // Otherwise rate limit by IP
    return (req as any).auth?.projectId || req.ip;
  }
});

// Routes
app.register(tracesRouter, { prefix: '/v1/traces' });
app.register(logsRouter, { prefix: '/logs' });
app.register(edgeSpansRouter, { prefix: '/v1/edge-spans' });
app.register(adminRouter, { prefix: '/admin' });

// Health check — used by load balancer
app.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

const start = async () => {
  try {
    await app.listen({ port: 4317, host: '0.0.0.0' });
    console.log('Ingestor running on port 4317');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
