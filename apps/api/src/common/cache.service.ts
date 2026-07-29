import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Cache with a graceful degradation path.
 *
 * Redis is the right answer at scale — it also makes "clone the repo and run
 * it" a three-service ordeal. When `REDIS_URL` is unset the service keeps an
 * in-process Map instead, so a single-node deployment or a contributor's laptop
 * needs nothing extra and the calling code never branches.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis | null;
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL');

    if (!url) {
      this.redis = null;
      this.logger.log('REDIS_URL not set — using an in-process cache');
      return;
    }

    this.redis = new Redis(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      // A cache outage must never take the API down with it.
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
    });

    this.redis.on('error', (error) => this.logger.warn(`redis error: ${error.message}`));
    void this.redis.connect().catch(() => {
      this.logger.warn('could not reach redis — falling back to the in-process cache');
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = this.redis?.status === 'ready' ? await this.redis.get(key) : this.readMemory(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    const raw = JSON.stringify(value);
    if (this.redis?.status === 'ready') {
      await this.redis.set(key, raw, 'EX', ttlSeconds);
      return;
    }
    this.memory.set(key, { value: raw, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    if (this.redis?.status === 'ready') await this.redis.del(key);
    this.memory.delete(key);
  }

  private readMemory(key: string): string | null {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }
}
