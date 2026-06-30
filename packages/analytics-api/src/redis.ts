import { Redis } from 'ioredis';

const redisOptions = {
  maxRetriesPerRequest: 0,   // Don't retry queued commands when Redis is down
  enableOfflineQueue: false,  // Don't queue commands when Redis is not connected
  lazyConnect: true,          // Don't connect until first command
};

export const redis = process.env.REDIS_URL 
  ? new Redis(process.env.REDIS_URL, redisOptions) 
  : new Redis({ ...redisOptions, host: '127.0.0.1', port: 6379 });

// Catch connection errors so they don't crash the process if Redis is offline
redis.on('error', () => {
  // Silent fallback when Redis is unavailable (rate limiting degrades gracefully)
});
