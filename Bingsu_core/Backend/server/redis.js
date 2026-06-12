import { createClient } from "redis";
import { redisUrl } from "./config.js";

let redisClient = null;

if (redisUrl) {
  redisClient = createClient({ url: redisUrl });
  redisClient.on("error", (error) => {
    console.error("Redis connection error", error);
  });
  redisClient.connect()
    .then(() => console.log("Redis connected"))
    .catch((error) => console.error("Redis connection failed", error));
}

export const getRedisClient = () => redisClient;
export const isRedisReady = () => Boolean(redisClient && redisClient.isOpen);
