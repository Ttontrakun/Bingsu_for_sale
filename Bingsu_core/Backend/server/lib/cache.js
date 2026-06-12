import { getRedisClient, isRedisReady } from "../redis.js";
import { cacheTtlSeconds } from "../config.js";

const CACHE_PREFIX = "cache:";
const TTL = (cacheTtlSeconds || 30) * 1000; // ms

const memoryStore = new Map();

function memoryGet(key) {
  const entry = memoryStore.get(key);
  if (!entry || entry.exp < Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key, value) {
  memoryStore.set(key, { value, exp: Date.now() + TTL });
}

function memoryDel(key) {
  memoryStore.delete(key);
}

async function memoryDelByPrefix(prefix) {
  for (const key of memoryStore.keys()) {
    if (key.startsWith(prefix)) memoryStore.delete(key);
  }
}

export function userCacheKey(prefix, userId) {
  return `${CACHE_PREFIX}user:${userId}:${prefix}`;
}

export function conversationMessagesKey(conversationId, limit) {
  return `${CACHE_PREFIX}conv:${conversationId}:messages:${limit}`;
}

function fullKey(key) {
  return key.startsWith(CACHE_PREFIX) ? key : `${CACHE_PREFIX}${key}`;
}

export async function cacheGet(key) {
  const k = fullKey(key);
  if (isRedisReady()) {
    try {
      const redis = getRedisClient();
      const raw = await redis.get(k);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn("Redis cache get fallback:", err.message);
    }
  }
  return memoryGet(k);
}

export async function cacheSet(key, value) {
  const k = fullKey(key);
  if (isRedisReady()) {
    try {
      const redis = getRedisClient();
      await redis.setEx(k, cacheTtlSeconds || 30, JSON.stringify(value));
      return;
    } catch (err) {
      console.warn("Redis cache set fallback:", err.message);
    }
  }
  memorySet(k, value);
}

export async function cacheDel(key) {
  const k = fullKey(key);
  if (isRedisReady()) {
    try {
      await getRedisClient().del(k);
      return;
    } catch (err) {
      console.warn("Redis cache del fallback:", err.message);
    }
  }
  memoryDel(k);
}

export async function invalidateUserCaches(userId) {
  const prefix = `${CACHE_PREFIX}user:${userId}:`;
  if (isRedisReady()) {
    try {
      const redis = getRedisClient();
      const keys = await redis.keys(prefix + "*");
      if (keys.length) await redis.del(keys);
      return;
    } catch (err) {
      console.warn("Redis invalidateUserCaches fallback:", err.message);
    }
  }
  await memoryDelByPrefix(prefix);
}

export async function invalidateConversationCaches(conversationId, userId) {
  const prefix = `${CACHE_PREFIX}conv:${conversationId}:`;
  const userListKey = userCacheKey("conversations", userId);
  if (isRedisReady()) {
    try {
      const redis = getRedisClient();
      const convKeys = await redis.keys(prefix + "*");
      const toDel = [...convKeys, userListKey];
      if (toDel.length) await redis.del(toDel);
      return;
    } catch (err) {
      console.warn("Redis invalidateConversationCaches fallback:", err.message);
    }
  }
  await memoryDelByPrefix(prefix);
  memoryDel(userListKey);
}
