import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

// Redis Configuration
export const redisUrl = process.env.REDIS_URL;
export const rateLimitRedisPrefix = process.env.RATE_LIMIT_REDIS_PREFIX || "rate";
