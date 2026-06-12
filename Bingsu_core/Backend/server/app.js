import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import path from "path";
import helmet from "helmet";
import { fileURLToPath } from "url";
import { corsOptions, isCorsOriginAllowed, port } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const uploadsDir = path.join(projectRoot, "uploads");
const ocrTestHtmlPath = path.resolve(__dirname, "static", "ocr-test.html");
import { startSessionCleanup } from "./services/sessions.js";
import { hydrateUploadQueue, startUploadWorker, useRedisQueue } from "./services/uploadQueue.js";
import { authRouter, signupHandler } from "./routes/auth.js";
import { uploadsRouter } from "./routes/uploads.js";
import { botsRouter } from "./routes/bots.js";
import { documentsRouter } from "./routes/documents.js";
import { adminRouter } from "./routes/admin.js";
import { supportRouter } from "./routes/support.js";
import { conversationsRouter, messagesRouter, chatRouter } from "./routes/conversations.js";
import { healthRouter } from "./routes/health.js";
import { integrationsRouter } from "./routes/integrations.js";
import { statsRouter } from "./routes/stats.js";
import { subscriptionRouter } from "./routes/subscription.js";
import { testOcrRouter } from "./routes/testOcr.js";
import { webhooksRouter, handleLineWebhookPost } from "./routes/webhooks.js";
import { bingFormatRouter } from "./routes/bingFormat.js";
import { internalRouter } from "./routes/internal.js";
import { logEvent } from "./lib/logging.js";

const app = express();

app.use(cors(corsOptions));
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "same-origin" },
}));
app.disable("x-powered-by");
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    origin
    && ["POST", "PUT", "PATCH", "DELETE"].includes(String(req.method || "").toUpperCase())
    && !isCorsOriginAllowed(origin)
  ) {
    return res.status(403).json({ error: "Invalid origin" });
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  next();
});
// LINE webhook ต้องรับ raw body เพื่อตรวจสอบ X-Line-Signature — ลงทะเบียนก่อน express.json()
app.post(
  "/api/webhooks/line",
  express.raw({ type: "application/json" }),
  (req, res) => {
    handleLineWebhookPost(req, res).catch((err) => {
      console.error("[LINE webhook]", err?.message || err);
      if (!res.headersSent) res.status(500).send("Internal error");
    });
  },
);
app.use(express.json({ limit: "25mb" })); // ใหญ่ขึ้นเพื่อหน้าเทส OCR (ส่งไฟล์ base64)
app.use(cookieParser());
app.use("/uploads/avatars", express.static(path.join(uploadsDir, "avatars"), { fallthrough: false }));
app.use("/uploads/bot-avatars", express.static(path.join(uploadsDir, "bot-avatars"), { fallthrough: false }));
app.use((req, res, next) => {
  const headerValue = req.headers["x-request-id"];
  const requestId = Array.isArray(headerValue) ? headerValue[0] : headerValue || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms (${req.requestId})`,
    );

    // เก็บ error log สำหรับตามรอยปัญหาผู้ใช้ (ไม่เก็บ IP)
    // เน้นเฉพาะ 5xx และ rate-limit (429) เพื่อลด noise
    const status = Number(res.statusCode || 0);
    if (status >= 500 || status === 429) {
      const user = req.user;
      logEvent({
        event: "http.error",
        actorId: user?.id,
        targetType: "http",
        targetId: req.requestId,
        meta: {
          method: req.method,
          url: req.originalUrl,
          status,
          durationMs,
          requestId: req.requestId,
          email: user?.email,
          role: user?.role,
        },
      }).catch(() => null);
    }
  });
  next();
});

app.get("/api/ping", (_req, res) => res.status(200).json({ ok: true }));
app.use("/api/health", healthRouter);
app.get("/api/avatars/:filename", (req, res) => {
  const filename = req.params.filename;
  if (!filename || !/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return res.status(400).send("Invalid filename");
  }
  const filePath = path.join(uploadsDir, "avatars", filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Not found");
  }
  res.sendFile(path.resolve(filePath));
});
app.use("/api/auth", authRouter);
// alias สำหรับ frontend ที่เรียก /api/users/register แทน /api/auth/signup
app.post("/api/users/register", (req, res, next) => {
  signupHandler(req, res).catch((err) => {
    console.error("[signup]", err?.message || err);
    if (!res.headersSent) res.status(500).json({ error: "Registration failed" });
  });
});
app.use("/api", uploadsRouter);
app.use("/api/bots", botsRouter);
app.use("/api/documents", documentsRouter);
app.use("/documents", bingFormatRouter);
app.use("/api/admin", adminRouter);
app.use("/api/support", supportRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/chat", chatRouter);
app.use("/api", integrationsRouter);
app.use("/api", statsRouter);
app.use("/api", subscriptionRouter);
app.use("/api/internal", internalRouter);
app.use("/api/test", testOcrRouter);
app.use("/api/webhooks", webhooksRouter);

// จับ error ที่หลุดจาก middleware/route (เช่น express.json() เมื่อ body ไม่ใช่ JSON)
app.use((err, req, res, next) => {
  console.error("[app] unhandled error:", err?.message || err, req?.method, req?.originalUrl, err?.stack);
  // บันทึก error ลง SystemLog เพื่อให้ดูในหน้า Logs ได้
  const user = req.user;
  logEvent({
    event: "http.exception",
    actorId: user?.id,
    targetType: "http",
    targetId: req.requestId,
    meta: {
      method: req?.method,
      url: req?.originalUrl,
      requestId: req?.requestId,
      status: 500,
      error: err?.message || String(err),
      email: user?.email,
      role: user?.role,
    },
  }).catch(() => null);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal Server Error" });
});

// หน้าเทส OCR — หลายทางเข้า
app.get("/ocr-test", (req, res) => {
  try {
    const html = fs.readFileSync(ocrTestHtmlPath, "utf8");
    res.type("html").send(html);
  } catch (e) {
    res.status(500).send("ไม่พบไฟล์ ocr-test.html: " + e.message);
  }
});
app.get("/api/ocr-test-link", (_req, res) => {
  res.json({
    ok: true,
    link: `http://localhost:${port}/ocr-test`,
    linkStatic: `http://localhost:${port}/test-ocr/ocr-test.html`,
    port,
  });
});
app.use("/test-ocr", express.static(path.join(__dirname, "static")));

// เสิร์ฟ Frontend build (React) เพื่อให้เปิด http://localhost/create-knowledge ได้ — ต้อง build ก่อน: cd ../Frontend && npm run build
const frontendBuildPath = path.resolve(projectRoot, "..", "Frontend", "build");
if (fs.existsSync(frontendBuildPath) && fs.statSync(frontendBuildPath).isDirectory()) {
  app.use(express.static(frontendBuildPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendBuildPath, "index.html"));
  });
  console.log("Serving frontend from", frontendBuildPath, "→ http://localhost:" + port + "/create-knowledge");
}

export const startServer = () => {
  if (!useRedisQueue()) {
    hydrateUploadQueue();
  }
  startSessionCleanup();
  const listenHost = process.env.LISTEN_HOST || "0.0.0.0";
  app.listen(port, listenHost, () => {
    console.log(`API server listening on http://${listenHost}:${port}`);
  });
};

export { startUploadWorker };
export { app };
