import Fastify from 'fastify';
import { metricsRouter } from './routes/metrics.js';
import { logsRouter } from './routes/logs.js';
import { tracesRouter } from './routes/traces.js';
import { logsStreamRouter } from './routes/logs-stream.js';

const app = Fastify({
  logger: true,
  trustProxy: true,
});

// Routes
app.register(metricsRouter, { prefix: '/metrics' });
app.register(logsRouter, { prefix: '/logs' });
app.register(tracesRouter, { prefix: '/traces' });
app.register(logsStreamRouter, { prefix: '/logs' });

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
