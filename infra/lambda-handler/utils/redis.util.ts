import Redis from 'ioredis';

let redisInstance: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis({
      host: process.env.REDIS_HOST || '116.118.3.84',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: false,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 5) return null; // Dừng retry nếu quá 5 lần
        return Math.min(times * 100, 2000);
      },
    });

    redisInstance.on('error', (err) => {
      console.error('[Redis Client Error]:', err);
    });

    redisInstance.on('connect', () => {
      console.log('[Redis Client Connected]');
    });
  }

  return redisInstance;
}
