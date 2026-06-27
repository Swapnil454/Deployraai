import { Redis } from 'ioredis';

export const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : new Redis();

// Catch connection errors so they don't spam the console if Redis is offline
redis.on('error', (err) => {
  // Silent fallback when Redis is unavailable (rate limiting degrades gracefully)
});
