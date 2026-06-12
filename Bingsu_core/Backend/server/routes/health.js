import express from "express";
import os from "node:os";
import { statfs } from "node:fs/promises";
import { prisma } from "../db.js";
import {
  qdrantUrl,
  redisUrl,
  vectorDb,
  pineconeApiKey,
  gatewayBaseUrl,
  openaiKey,
  openaiModel,
  fileStorageProvider,
  s3Bucket,
  storeRawFiles,
  s3AccessKeyId,
} from "../config.js";
import { isRedisReady } from "../redis.js";

export const healthRouter = express.Router();

const withTimeout = async (promise, ms) => {
  const timeoutMs = Number.isFinite(ms) ? ms : 0;
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Health check timed out")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

const checkQdrant = async () => {
  if (!qdrantUrl) return { ok: false, error: "Missing QDRANT_URL" };
  try {
    const response = await withTimeout(fetch(`${qdrantUrl}/collections`), 1500);
    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: text || `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const checkPinecone = async () => {
  if (!pineconeApiKey) return { ok: false, error: "Missing PINECONE_API_KEY" };
  try {
    const { Pinecone } = await import("@pinecone-database/pinecone");
    const pc = new Pinecone({ apiKey: pineconeApiKey });
    await withTimeout(pc.listIndexes(), 3000);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const AI_HEALTH_TIMEOUT_MS = 8000;
const aiHealthCheckEnabled = (process.env.ENABLE_AI_HEALTH_CHECK || "false").toLowerCase() === "true";

const checkAiService = async () => {
  if (!openaiKey || !gatewayBaseUrl) {
    return { ok: false, error: "Missing OPENAI_API_KEY or GATEWAY_BASE_URL", responseTimeMs: null, model: openaiModel || "—" };
  }
  const start = Date.now();
  try {
    const res = await withTimeout(
      fetch(`${gatewayBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: openaiModel || "ict-ollama/gpt-oss:120b",
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1,
        }),
      }),
      AI_HEALTH_TIMEOUT_MS
    );
    const responseTimeMs = Date.now() - start;
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text || `HTTP ${res.status}`, responseTimeMs, model: openaiModel || "—" };
    }
    return { ok: true, responseTimeMs, model: openaiModel || "—" };
  } catch (error) {
    const responseTimeMs = Date.now() - start;
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      responseTimeMs,
      model: openaiModel || "—",
    };
  }
};

/** พื้นที่ดิสก์ที่ path (Node statfs) + หน่วยความจำ / load ของโปรเซส */
const buildHostStats = async () => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memoryUsedPercent =
    totalMem > 0 ? Math.min(100, Math.round(((totalMem - freeMem) / totalMem) * 100)) : null;
  const load = typeof os.loadavg === "function" ? os.loadavg()[0] : null;
  const loadAverage = load != null && !Number.isNaN(load) ? Math.round(load * 100) / 100 : null;
  const uptimeSec = os.uptime();
  const uptimeHours = Math.round((uptimeSec / 3600) * 10) / 10;

  let disk = { ok: false };
  const tryPaths = [process.cwd(), "/", "C:\\"];
  for (const p of tryPaths) {
    try {
      const s = await statfs(p);
      const bsize = Number(s.bsize) || 1;
      const blocks = Number(s.blocks) || 0;
      const bfree = Number(s.bfree) || 0;
      const total = blocks * bsize;
      const free = bfree * bsize;
      if (total > 0) {
        const usedPercent = Math.min(100, Math.round(((total - free) / total) * 100));
        disk = {
          ok: true,
          path: p,
          usedPercent,
          freeGb: Math.round((free / 1e9) * 10) / 10,
          totalGb: Math.round((total / 1e9) * 10) / 10,
        };
        break;
      }
    } catch {
      /* next path */
    }
  }

  return { memoryUsedPercent, loadAverage, uptimeHours, disk };
};

const buildOcrHealth = () => {
  const typhoon = (process.env.TYPHOON_OCR_API_KEY || "").trim();
  const ocrApi = (process.env.OCR_API_URL || "").replace(/\/+$/, "").trim();
  const pdfProvider = (process.env.PDF_PROVIDER || "pdfjs").trim().toLowerCase();
  const configured = Boolean(typhoon || ocrApi);
  return {
    ok: configured,
    typhoonConfigured: Boolean(typhoon),
    pdfProvider,
    note: configured
      ? undefined
      : "ยังไม่ได้ตั้งค่า OCR",
  };
};

const buildStorageHealth = (disk) => {
  const provider = (fileStorageProvider || "local").trim().toLowerCase();
  const s3Ready = provider === "s3" && Boolean(s3Bucket && s3AccessKeyId);
  const diskOk = disk?.ok === true;
  const usagePercent = diskOk ? disk.usedPercent : null;
  const nearlyFull = usagePercent != null && usagePercent >= 90;
  return {
    ok: diskOk || (provider === "s3" && s3Ready),
    provider,
    storeRawFiles,
    disk: diskOk ? disk : null,
    s3: provider === "s3" ? { bucket: s3Bucket || null, configured: s3Ready } : null,
    usagePercent,
    nearlyFull,
    summary: diskOk
      ? `ใช้พื้นที่ ~${usagePercent}% (~${disk.freeGb} GB ว่างจาก ~${disk.totalGb} GB)`
      : provider === "s3"
        ? s3Ready
          ? "เก็บไฟล์ที่ S3 (ดิสก์เครื่อง = cache/working dir)"
          : "ตั้ง FILE_STORAGE_PROVIDER=s3 แต่ยังไม่ครบ S3_*"
        : "อ่านพื้นที่ดิสก์ไม่ได้บนระบบนี้",
  };
};

healthRouter.get("/", async (_req, res) => {
  const health = {
    ok: true,
    database: { ok: false },
    redis: { ok: false, enabled: Boolean(redisUrl) },
    qdrant: { ok: false },
    ai: { ok: false },
    storage: null,
    ocr: null,
    server: null,
  };
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.database.ok = true;
  } catch (error) {
    console.error("Database connection failed", error);
    health.ok = false;
    const dbErrorMsg = error instanceof Error ? error.message : String(error);
    health.database = { ok: false, error: dbErrorMsg };
  }

  if (redisUrl) {
    health.redis.ok = isRedisReady();
  } else {
    health.redis.ok = true;
  }

  const vectorCheck = vectorDb === "pinecone" ? await checkPinecone() : await checkQdrant();
  health.qdrant = vectorCheck;

  const aiCheck = aiHealthCheckEnabled
    ? await checkAiService()
    : {
        ok: true,
        skipped: true,
        reason: "AI health check disabled (ENABLE_AI_HEALTH_CHECK=false)",
        responseTimeMs: null,
        model: openaiModel || "—",
      };
  let gatewayHost = null;
  if (gatewayBaseUrl) {
    try {
      gatewayHost = new URL(gatewayBaseUrl).host;
    } catch {
      gatewayHost = null;
    }
  }
  health.ai = { ...aiCheck, gatewayHost };
  health.vectorDb = vectorDb;

  const host = await buildHostStats();
  health.server = {
    ok: true,
    memoryUsedPercent: host.memoryUsedPercent,
    loadAverage: host.loadAverage,
    uptimeHours: host.uptimeHours,
    disk: host.disk.ok ? host.disk : null,
  };
  health.ocr = buildOcrHealth();
  health.storage = buildStorageHealth(host.disk);

  const fullyOperational =
    health.database.ok &&
    health.redis.ok &&
    health.qdrant.ok &&
    aiCheck.ok;

  // ok = ทุกระบบพร้อม (แชท/RAG เต็มรูปแบบ)
  health.ok = fullyOperational;
  // coreOk = ฐานข้อมูลใช้งานได้ — ล็อกอิน / Supportadmin / รายชื่อผู้ใช้ ยังทำงาน
  health.coreOk = health.database.ok;
  health.degraded = health.database.ok && !fullyOperational;

  // HTTP 503 เฉพาะเมื่อ DB ล้ม — ไม่บล็อกทั้ง API เพราะ AI หรือ Qdrant ขัดข้องชั่วคราว
  res.status(health.database.ok ? 200 : 503).json(health);
});
