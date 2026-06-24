import Fastify from 'fastify';
import { tracesRouter } from './routes/traces.js';
import { logsRouter } from './routes/logs.js';
import { edgeSpansRouter } from './routes/edge-spans.js';

const app = Fastify({
  logger: true,
  // Trust X-Forwarded-For — ingestor is behind a load balancer
  trustProxy: true,
});

// Routes
app.register(tracesRouter, { prefix: '/v1/traces' });
app.register(logsRouter, { prefix: '/logs' });
app.register(edgeSpansRouter, { prefix: '/v1/edge-spans' });

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
