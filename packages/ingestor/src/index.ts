import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { redis } from './redis.js';
import { tracesRouter } from './routes/traces.js';
import { logsRouter } from './routes/logs.js';
import { edgeSpansRouter } from './routes/edge-spans.js';
import { adminRouter } from './routes/admin.js';
import { rumRouter } from './routes/rum.js';

const app = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024, // 10MB limit for spans
  // Trust X-Forwarded-For — ingestor is behind a load balancer
  trustProxy: true,
});

app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
  (req as any).rawBody = body; // store raw bytes
  try { done(null, JSON.parse(body.toString())); }
  catch(e) { done(e as Error); }
});

app.register(rateLimit, {
  redis,
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
app.register(rumRouter, { prefix: '/v1/rum' });
app.register(adminRouter, { prefix: '/admin' });

import { sourcemapsRouter } from './routes/sourcemaps.js';
app.register(sourcemapsRouter, { prefix: '/v1/sourcemaps' });

// Health check — used by load balancer
app.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

import { db } from './db.js';
import { renderPollerRegistry } from './pollers/render-poller.js';

async function restoreRenderPollers() {
  const projects = await db.query(
    `SELECT id, render_token, render_service_id 
     FROM projects WHERE platform = 'render' AND is_active = true`
  );
  for (const p of projects.rows) {
    renderPollerRegistry.start(p.id, p.render_token, p.render_service_id);
  }
  console.log(`Restored ${projects.rows.length} Render pollers`);
}

const start = async () => {
  try {
    await app.listen({ port: 4317, host: '0.0.0.0' });
    console.log('Ingestor running on port 4317');
    await restoreRenderPollers();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
