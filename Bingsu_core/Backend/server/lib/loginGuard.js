import { getRedisClient, isRedisReady } from "../redis.js";

const memoryStore = new Map();
const LOCK_WINDOW_MS = Number(process.env.LOGIN_LOCK_WINDOW_MS || 15 * 60 * 1000);
const LOCK_THRESHOLD = Number(process.env.LOGIN_LOCK_THRESHOLD || 6);

const cleanupMemory = () => {
  const now = Date.now();
  for (const [key, state] of memoryStore.entries()) {
    if (!state || state.expiresAt <= now) memoryStore.delete(key);
  }
};

const makeKeys = (email, ip) => {
  const safeEmail = String(email || "").trim().toLowerCase();
  const safeIp = String(ip || "unknown").trim() || "unknown";
  return [`loginlock:email:${safeEmail}`, `loginlock:ip:${safeIp}`];
};

const redisBump = async (key) => {
  const redis = getRedisClient();
  const count = await redis.incr(key);
  if (count === 1) await redis.pexpire(key, LOCK_WINDOW_MS);
  const ttl = await redis.pttl(key);
  return { count, ttlMs: ttl > 0 ? ttl : LOCK_WINDOW_MS };
};

const memoryBump = (key) => {
  cleanupMemory();
  const now = Date.now();
  let state = memoryStore.get(key);
  if (!state || state.expiresAt <= now) {
    state = { count: 0, expiresAt: now + LOCK_WINDOW_MS };
  }
  state.count += 1;
  memoryStore.set(key, state);
  return { count: state.count, ttlMs: Math.max(0, state.expiresAt - now) };
};

const redisRead = async (key) => {
  const redis = getRedisClient();
  const [rawCount, ttl] = await redis.multi().get(key).pttl(key).exec();
  const count = Number(rawCount || 0);
  return { count, ttlMs: Number(ttl) > 0 ? Number(ttl) : 0 };
};

const memoryRead = (key) => {
  cleanupMemory();
  const now = Date.now();
  const state = memoryStore.get(key);
  if (!state || state.expiresAt <= now) return { count: 0, ttlMs: 0 };
  return { count: state.count, ttlMs: Math.max(0, state.expiresAt - now) };
};

const redisDelete = async (keys) => {
  const redis = getRedisClient();
  if (!keys.length) return;
  await redis.del(keys);
};

const memoryDelete = (keys) => {
  keys.forEach((k) => memoryStore.delete(k));
};

export const isLoginLocked = async (email, ip) => {
  const keys = makeKeys(email, ip);
  let records;
  if (isRedisReady()) {
    try {
      records = await Promise.all(keys.map((k) => redisRead(k)));
    } catch {
      records = keys.map((k) => memoryRead(k));
    }
  } else {
    records = keys.map((k) => memoryRead(k));
  }
  const locked = records.some((r) => r.count >= LOCK_THRESHOLD);
  const retryAfterMs = records.reduce((max, r) => Math.max(max, r.ttlMs || 0), 0);
  return { locked, retryAfterMs };
};

export const recordFailedLogin = async (email, ip) => {
  const keys = makeKeys(email, ip);
  let records;
  if (isRedisReady()) {
    try {
      records = await Promise.all(keys.map((k) => redisBump(k)));
    } catch {
      records = keys.map((k) => memoryBump(k));
    }
  } else {
    records = keys.map((k) => memoryBump(k));
  }
  const locked = records.some((r) => r.count >= LOCK_THRESHOLD);
  const retryAfterMs = records.reduce((max, r) => Math.max(max, r.ttlMs || 0), 0);
  return { locked, retryAfterMs };
};

export const clearLoginLock = async (email, ip) => {
  const keys = makeKeys(email, ip);
  if (isRedisReady()) {
    try {
      await redisDelete(keys);
      return;
    } catch {
      // fallback below
    }
  }
  memoryDelete(keys);
};
