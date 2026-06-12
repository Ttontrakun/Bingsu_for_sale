import express from "express";
import fs from "fs/promises";
import path from "path";
import { prisma } from "../db.js";
import { authenticate } from "../lib/auth.js";
import { getRequestContext } from "../lib/requestContext.js";
import { logEvent } from "../lib/logging.js";
import { rateLimit } from "../lib/rateLimit.js";
import {
  assembleUploadParts,
  canUploadMoreToday,
  createUploadBatch,
  createUploadSession,
  enqueueUploadBatch,
  getUploadPaths,
  previewPdfStructure,
} from "../services/uploadQueue.js";
import {
  MAX_UPLOAD_PART_BYTES,
  allowedUploadExtensions,
  allowedUploadMimeTypes,
  maxUploadFileBytes,
} from "../config.js";

export const uploadsRouter = express.Router();

const normalizeExtension = (name = "") => {
  const normalizedName = String(name || "").trim().replace(/["']+$/g, "");
  return path.extname(normalizedName).toLowerCase().trim();
};
const isAllowedUpload = (name, type) => {
  const ext = normalizeExtension(name);
  const hasAllowedExt = ext ? allowedUploadExtensions.includes(ext) : false;
  const hasAllowedType = type ? allowedUploadMimeTypes.includes(String(type)) : false;
  return hasAllowedExt || hasAllowedType;
};

const rawUpload = express.raw({
  type: "application/octet-stream",
  limit: MAX_UPLOAD_PART_BYTES,
});

/** โครงสร้างก่อนอัปโหลด — ส่ง fileBase64, fileName, contentType, structureProvider (optional: "typhoon" | "paddle_llm") */
uploadsRouter.post("/upload/preview-structure", authenticate, async (req, res) => {
  try {
    const { fileBase64, fileName, contentType, structureProvider } = req.body ?? {};
    if (!fileBase64) {
      return res.status(400).json({ error: "ต้องส่ง fileBase64" });
    }
    const buffer = Buffer.from(fileBase64, "base64");
    const name = fileName && typeof fileName === "string" ? fileName : "document.pdf";
    const type = contentType && typeof contentType === "string" ? contentType : "application/pdf";
    const file = await previewPdfStructure({
      buffer,
      fileName: name,
      contentType: type,
      structureProvider: structureProvider === "typhoon" || structureProvider === "paddle_llm" ? structureProvider : undefined,
    });
    return res.json({ sourceFiles: [file] });
  } catch (e) {
    console.error("Preview structure error:", e);
    const msg = e?.message || "Preview failed";
    return res.status(500).json({
      error: msg,
      hint: /ไม่สามารถเชื่อมต่อ OCR|fetch failed|ECONNREFUSED|bad address/i.test(msg)
        ? "ตรวจสอบว่า container api รันอยู่: docker compose --profile app ps — ถ้า api แสดง Exited (137) แปลว่า OOM (หน่วยความจำไม่พอ) ให้เพิ่ม RAM ให้ Docker (เช่น Docker Desktop → Settings → Resources) แล้ว docker compose start api"
        : undefined,
    });
  }
});

uploadsRouter.post("/upload-batches", authenticate, async (req, res) => {
  const { displayName } = req.body ?? {};
  if (!displayName) {
    res.status(400).json({ error: "displayName is required" });
    return;
  }
  if (!(await rateLimit(`upload:${req.user.id}`))) {
    res.status(429).json({ error: "Rate limit exceeded" });
    return;
  }
  const batch = await createUploadBatch(req.user.id, displayName);
  res.status(201).json(batch);
});

uploadsRouter.get("/upload-batches/:id", authenticate, async (req, res) => {
  const batch = await prisma.uploadBatch.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { document: true },
  });
  if (!batch) {
    res.status(404).json({ error: "Upload batch not found" });
    return;
  }
  // This endpoint is polled by the frontend; avoid caching/ETag 304 responses.
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  res.json(batch);
});

uploadsRouter.post("/upload-batches/:id/files", authenticate, async (req, res) => {
  const { name, size, type, totalParts } = req.body ?? {};
  if (!name || !size || !totalParts) {
    res.status(400).json({ error: "name, size and totalParts are required" });
    return;
  }
  if (!isAllowedUpload(name, type)) {
    res.status(400).json({ error: "Unsupported file type" });
    return;
  }
  const numericSize = Number(size);
  if (Number.isFinite(maxUploadFileBytes) && numericSize > maxUploadFileBytes) {
    res.status(400).json({ error: "File exceeds maximum size" });
    return;
  }
  if (!(await rateLimit(`upload:${req.user.id}`))) {
    res.status(429).json({ error: "Rate limit exceeded" });
    return;
  }
  const canUpload = await canUploadMoreToday(req.user.id, numericSize);
  if (!canUpload) {
    res.status(429).json({ error: "Daily upload quota exceeded" });
    return;
  }
  const session = await createUploadSession(req.params.id, req.user.id, {
    name,
    size: Number(size),
    type,
    totalParts: Number(totalParts),
  });
  res.status(201).json({ uploadId: session.id });
});

uploadsRouter.put("/uploads/:id/parts/:partNumber", authenticate, rawUpload, async (req, res) => {
  const partNumber = Number(req.params.partNumber);
  if (!partNumber || partNumber <= 0) {
    res.status(400).json({ error: "Invalid part number" });
    return;
  }
  if (!req.body || !(req.body instanceof Buffer)) {
    res.status(400).json({ error: "Upload body is required" });
    return;
  }
  const session = await prisma.uploadFile.findFirst({
    where: { id: req.params.id, batch: { userId: req.user.id } },
  });
  if (!session) {
    res.status(404).json({ error: "Upload session not found" });
    return;
  }

  const { sessionDir, partsDir } = getUploadPaths(session.id, session.name);
  await fs.mkdir(partsDir, { recursive: true }).catch(() => null);

  const partPath = path.join(
    partsDir,
    `part-${String(partNumber).padStart(6, "0")}`,
  );
  await fs.writeFile(partPath, req.body);
  await prisma.uploadFile.update({
    where: { id: session.id },
    data: { receivedParts: Math.min(session.receivedParts + 1, session.totalParts) },
  });

  res.json({ ok: true });
});

uploadsRouter.post("/uploads/:id/complete", authenticate, async (req, res) => {
  const session = await prisma.uploadFile.findFirst({
    where: { id: req.params.id, batch: { userId: req.user.id } },
  });
  if (!session) {
    res.status(404).json({ error: "Upload session not found" });
    return;
  }

  const { partsDir, assembledPath } = getUploadPaths(session.id, session.name);
  const partFiles = (await fs.readdir(partsDir).catch(() => [])).filter((file) =>
    file.startsWith("part-"),
  );
  const receivedParts = partFiles.length;
  if (receivedParts !== session.totalParts) {
    res.status(400).json({ error: "Upload is incomplete" });
    return;
  }

  await assembleUploadParts(session, partsDir, assembledPath);
  const delta = Math.max(0, receivedParts - session.receivedParts);
  await prisma.uploadFile.update({
    where: { id: session.id },
    data: { status: "complete", receivedParts },
  });
  if (delta > 0) {
    await prisma.uploadBatch.update({
      where: { id: session.batchId },
      data: { uploadPartsReceived: { increment: delta } },
    });
  }

  res.json({ ok: true });
});

uploadsRouter.post("/upload-batches/:id/complete", authenticate, async (req, res) => {
  const batch = await prisma.uploadBatch.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { files: true },
  });
  if (!batch) {
    res.status(404).json({ error: "Upload batch not found" });
    return;
  }

  const allCompleted = batch.files.length > 0 && batch.files.every((file) => file.status === "complete");

  if (!allCompleted) {
    res.status(400).json({ error: "Uploads are not completed yet" });
    return;
  }

  const previewSourceFiles = Array.isArray(req.body?.previewSourceFiles) ? req.body.previewSourceFiles : null;
  if (previewSourceFiles) {
    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: { previewSourceFiles },
    });
  }

  if (batch.status !== "processing" && batch.status !== "done") {
    await enqueueUploadBatch(batch.id);
  }

  await logEvent({
    event: "upload.batch.completed",
    actorId: req.user.id,
    targetType: "uploadBatch",
    targetId: batch.id,
    meta: {
      displayName: batch.displayName,
      fileCount: batch.files?.length ?? 0,
      ...getRequestContext(req),
    },
  });

  res.json({ ok: true });
});
