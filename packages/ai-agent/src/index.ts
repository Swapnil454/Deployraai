import Fastify from 'fastify';
import { Redis } from 'ioredis';
import rateLimit from '@fastify/rate-limit';
import { aiRouter } from './routes/ai.js';
import { githubRouter } from './routes/github.js';

const app = Fastify({ logger: true, trustProxy: true });

export const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : undefined;

app.register(rateLimit, {
  max: 30,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip
});

app.register(aiRouter, { prefix: '/ai' });
app.register(githubRouter, { prefix: '/github' });

app.get('/health', async () => ({ status: 'ok', service: 'ai-agent' }));

const start = async () => {
  try {
    await app.listen({ port: 4319, host: '0.0.0.0' });
    console.log('AI Agent running on port 4319');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
