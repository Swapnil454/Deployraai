import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
// import { redis } from './redis.js';
import { tracesRouter } from './routes/traces.js';
import { logsRouter } from './routes/logs.js';
import { edgeSpansRouter } from './routes/edge-spans.js';
import { adminRouter } from './routes/admin.js';
import { rumRouter } from './routes/rum.js';
import { profilesRouter } from './routes/profiles.js';

const app = Fastify({
  logger: true,
  // Trust X-Forwarded-For — ingestor is behind a load balancer
  trustProxy: true,
});

app.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-rum-key'],
});


app.register(rateLimit, {
  // We use an in-memory LRU cache because Redis is disabled.
  // To prevent memory leaks (OOM) via attackers generating infinite unique keys:
  // 1. We strictly bind the rate limit key to the requester's IP.
  // 2. We cap the maximum number of keys stored in memory (cache).
  max: 100, // 100 requests per minute
  timeWindow: '1 minute',
  cache: 5000, // Hard limit of 5000 keys in memory to prevent Heap OOM
  keyGenerator: (req) => {
    const rumKey = req.headers['x-rum-key'] ? String(req.headers['x-rum-key']).slice(0, 50) : '';
    const projectId = (req as any).auth?.projectId ? String((req as any).auth.projectId) : '';
    
    // Always prefix with the requester's IP so an attacker from a single IP 
    // cannot bypass limits by simply rotating 'x-rum-key' headers.
    return `${req.ip}:${rumKey}:${projectId}`;
  }
});

// Routes
app.register(tracesRouter, { prefix: '/v1/traces' });
app.register(logsRouter, { prefix: '/logs' });
app.register(edgeSpansRouter, { prefix: '/v1/edge-spans' });
app.register(rumRouter, { prefix: '/v1/rum' });
app.register(adminRouter, { prefix: '/admin' });
app.register(profilesRouter, { prefix: '/v1/profiles' });

import { sourcemapsRouter } from './routes/sourcemaps.js';
app.register(sourcemapsRouter, { prefix: '/v1/sourcemaps' });

// Health check — used by load balancer
app.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

// Expose internal telemetry metrics (connection pools, queue depth)
app.get('/metrics', async () => {
  return {
    postgres_pool: {
      total_connections: db.totalCount,
      idle_connections: db.idleCount,
      waiting_clients: db.waitingCount
    }
  };
});

import { db, initDb } from './db.js';
import { renderPollerRegistry } from './pollers/render-poller.js';

import { usagePoller } from './pollers/usage-poller.js';

import { runRetentionPoller } from './pollers/retention-poller.js';

async function restoreRenderPollers() {
  // ...
  
  usagePoller.start();

  // Run retention poller immediately, then every hour
  runRetentionPoller();
  setInterval(runRetentionPoller, 60 * 60 * 1000);
}

const start = async () => {
  try {
    console.log('Running database migrations...');
    await initDb();
    
    await app.listen({ port: 4317, host: '0.0.0.0' });
    console.log('Ingestor running on port 4317');
    await restoreRenderPollers();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
