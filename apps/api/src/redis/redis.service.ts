import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  readonly subscriber: Redis;

  constructor() {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    this.client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 3 });
    this.subscriber = new Redis(url, { maxRetriesPerRequest: 3 });
    this.client.on("error", (e) => this.logger.error(`redis: ${e.message}`));
  }

  /**
   * Distributed lock (SET NX PX + token + compare-del release).
   * Wraps every critical transactional mutation (fights, orders, dividends...).
   */
  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>, maxWaitMs = 5000): Promise<T> {
    const lockKey = `lock:${key}`;
    const token = `${process.pid}-${Date.now()}-${Math.random()}`;
    const deadline = Date.now() + maxWaitMs;

    for (;;) {
      const ok = await this.client.set(lockKey, token, "PX", ttlMs, "NX");
      if (ok === "OK") break;
      if (Date.now() > deadline) throw new Error(`lock timeout: ${lockKey}`);
      await this.sleep(25);
    }

    try {
      return await fn();
    } finally {
      await this.client.eval(RELEASE_SCRIPT, 1, lockKey, token);
    }
  }

  /** Cache helper with JSON serialization. */
  async cacheGet<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }
  async cacheSet(key: string, value: unknown, ttlSeconds: number) {
    await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  async publish(channel: string, payload: unknown) {
    await this.client.publish(channel, JSON.stringify(payload));
  }

  async onBattleEvent(cb: (battleId: string, event: unknown) => void) {
    await this.subscriber.psubscribe("battle:*");
    this.subscriber.on("pmessage", (_pattern, channel, message) => {
      if (channel.startsWith("battle:")) {
        const battleId = channel.slice("battle:".length);
        try {
          cb(battleId, JSON.parse(message));
        } catch {
          /* ignore malformed */
        }
      }
    });
  }

  async onChatEvent(cb: (countryId: string, event: unknown) => void) {
    await this.subscriber.psubscribe("chat:country:*");
    this.subscriber.on("pmessage", (_pattern, channel, message) => {
      if (channel.startsWith("chat:country:")) {
        const countryId = channel.slice("chat:country:".length);
        try {
          cb(countryId, JSON.parse(message));
        } catch {
          /* ignore malformed */
        }
      }
    });
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
    await this.subscriber.quit().catch(() => undefined);
  }
}
