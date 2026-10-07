import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password');

    this.client = new Redis({
      host,
      port,
      password: password || undefined,
      lazyConnect: true,
      retryStrategy: (times) => {
        return Math.min(times * 100, 3000);
      },
    });

    this.client.connect().catch((err: unknown) => {
      this.logger.warn(`Could not connect to Redis: ${(err as Error).message}`);
    });
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (err) {
      this.logger.error(
        `Redis set error for key ${key}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (err) {
      this.logger.error(
        `Redis get error for key ${key}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (err) {
      this.logger.error(
        `Redis del error for key ${key}: ${(err as Error).message}`,
      );
      return 0;
    }
  }

  getClient(): Redis {
    return this.client;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sadd(key, ...members);
    } catch (err) {
      this.logger.error(`Redis sadd error for key ${key}: ${(err as Error).message}`);
      return 0;
    }
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.srem(key, ...members);
    } catch (err) {
      this.logger.error(`Redis srem error for key ${key}: ${(err as Error).message}`);
      return 0;
    }
  }

  async smembers(key: string): Promise<string[]> {
    try {
      return await this.client.smembers(key);
    } catch (err) {
      this.logger.error(`Redis smembers error for key ${key}: ${(err as Error).message}`);
      return [];
    }
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    if (!keys || keys.length === 0) return [];
    try {
      return await this.client.mget(...keys);
    } catch (err) {
      this.logger.error(`Redis mget error: ${(err as Error).message}`);
      return [];
    }
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
    }
  }
}
