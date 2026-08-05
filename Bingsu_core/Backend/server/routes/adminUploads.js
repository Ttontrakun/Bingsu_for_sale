/**
 * สถานะคิวประมวลผลไฟล์สำหรับ Support Admin — ดูรายการ batch ล่าสุด (กำลังทำ/สำเร็จ/ล้มเหลว)
 * และสั่ง retry batch ที่ล้มเหลวได้โดยไม่ต้องอัปโหลดใหม่ (ไฟล์ที่ประกอบแล้วยังอยู่บนดิสก์จนกว่าจะสำเร็จ)
 */
import express from "express";
import fs from "fs/promises";
import { prisma } from "../db.js";
import { authenticate, requireRole } from "../lib/auth.js";
import { logEvent } from "../lib/logging.js";
import { enqueueUploadBatch } from "../services/uploadQueue.js";

export const adminUploadsRouter = express.Router();

adminUploadsRouter.get("/upload-batches", authenticate, requireRole("support", "admin", "admin_metrics"), async (req, res) => {
  const takeRaw = Number(req.query?.take);
  const take = Number.isFinite(takeRaw) ? Math.max(1, Math.min(200, Math.floor(takeRaw))) : 50;
  const status = typeof req.query?.status === "string" ? req.query.status.trim() : "";

  const where = {};
  if (["uploading", "processing", "done", "error"].includes(status)) where.status = status;

  const batches = await prisma.uploadBatch.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: { select: { id: true, email: true, name: true } },
      document: { select: { id: true, displayName: true } },
      files: { select: { id: true, name: true, size: true, status: true } },
    },
  });

  res.json({
    batches: batches.map((b) => ({
      id: b.id,
      displayName: b.displayName,
      status: b.status,
      error: b.error,
      progressCurrent: b.progressCurrent,
      progressTotal: b.progressTotal,
      progressMessage: b.progressMessage,
      progressFileName: b.progressFileName,
      documentId: b.documentId,
      documentName: b.document?.displayName || null,
      userName: b.user?.name || b.user?.email || "-",
      files: b.files.map((f) => ({ id: f.id, name: f.name, size: f.size, status: f.status })),
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    })),
  });
});

adminUploadsRouter.post("/upload-batches/:id/retry", authenticate, requireRole("support", "admin"), async (req, res) => {
  const batch = await prisma.uploadBatch.findUnique({
    where: { id: req.params.id },
    include: { files: true },
  });
  if (!batch) {
    res.status(404).json({ error: "ไม่พบ batch นี้" });
    return;
  }
  if (batch.status !== "error") {
    res.status(409).json({ error: `retry ได้เฉพาะ batch ที่ล้มเหลว (สถานะปัจจุบัน: ${batch.status})` });
    return;
  }

  // ตรวจว่าไฟล์ที่ประกอบแล้วยังอยู่ครบ — ถ้าถูกลบไปแล้วต้องอัปโหลดใหม่เท่านั้น
  const missing = [];
  for (const file of batch.files) {
    if (!file.assembledPath) {
      missing.push(file.name);
      continue;
    }
    try {
      await fs.access(file.assembledPath);
    } catch {
      missing.push(file.name);
    }
  }
  if (missing.length > 0) {
    res.status(410).json({ error: `ไฟล์ต้นฉบับถูกลบไปแล้ว (${missing.join(", ")}) — ต้องอัปโหลดใหม่` });
    return;
  }

  await prisma.uploadBatch.update({
    where: { id: batch.id },
    data: { status: "uploading", error: null, progressMessage: "รอประมวลผลใหม่ (retry)..." },
  });
  await enqueueUploadBatch(batch.id);
  await logEvent({
    event: "admin.upload.batch.retry",
    actorId: req.user.id,
    targetType: "upload_batch",
    targetId: batch.id,
    meta: {
      displayName: batch.displayName || null,
      userId: batch.userId || null,
      previousStatus: "error",
    },
  });
  res.json({ ok: true, batchId: batch.id });
});
