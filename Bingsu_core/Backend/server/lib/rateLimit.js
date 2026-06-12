import { getRedisClient, isRedisReady } from "../redis.js";
import { rateLimitRedisPrefix, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX } from "../config.js";

const WINDOW_MS = Number.isFinite(RATE_LIMIT_WINDOW_MS) && RATE_LIMIT_WINDOW_MS > 0 ? RATE_LIMIT_WINDOW_MS : 60 * 1000;
const MAX_PER_WINDOW = Number.isFinite(RATE_LIMIT_MAX) && RATE_LIMIT_MAX > 0 ? RATE_LIMIT_MAX : 300;

const memoryStore = new Map();

function memoryIncr(key) {
  const now = Date.now();
  let entry = memoryStore.get(key);
  if (!entry || entry.windowStart < now - WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    memoryStore.set(key, entry);
  }
  entry.count += 1;
  return entry.count <= MAX_PER_WINDOW;
}

/**
 * Check rate limit for key. Returns true if allowed, false if rate limited.
 * @param {string} key - e.g. "auth:1.2.3.4" or "chat:userId"
 * @returns {Promise<boolean>}
 */
export async function rateLimit(key) {
  const fullKey = `${rateLimitRedisPrefix}:${key}`;
  if (isRedisReady()) {
    try {
      const redis = getRedisClient();
      const count = await redis.incr(fullKey);
      if (count === 1) await redis.pExpire(fullKey, WINDOW_MS);
      return count <= MAX_PER_WINDOW;
    } catch (err) {
      console.warn("Redis rate limit fallback to memory:", err.message);
    }
  }
  return memoryIncr(fullKey);
}
