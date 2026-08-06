/**
 * Internal endpoints — ใช้เมื่อ Bing Website โฟร์วาร์ดคำขอ OCR มา (ไม่ต้อง auth แบบ session)
 * POST /api/internal/ocr-extract = รับไฟล์ ทำ OCR ด้วย runOcrExtract ส่งกลับ format Bing
 * ต้องตั้ง ASKAA_INTERNAL_KEY และส่ง header x-internal-key เสมอ (fail-closed)
 */
import crypto from "crypto";
import express from "express";
import multer from "multer";
import { runOcrExtract } from "../services/uploadQueue.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

function safeEqualString(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function checkInternalKey(req, res, next) {
  const key = String(process.env.ASKAA_INTERNAL_KEY || "").trim();
  if (!key) {
    res.status(503).json({ ok: false, error: "Internal API key is not configured" });
    return;
  }
  const sent = req.headers["x-internal-key"];
  if (!safeEqualString(sent, key)) {
    res.status(403).json({ ok: false, error: "Forbidden" });
    return;
  }
  next();
}

router.post(
  "/ocr-extract",
  checkInternalKey,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        res.status(400).json({ ok: false, error: "ไม่มีไฟล์" });
        return;
      }
      const fileName = req.file.originalname || req.file.fieldname || "file";
      const contentType = req.file.mimetype || "application/octet-stream";
      const isPdf = contentType.toLowerCase().includes("pdf") || /\.pdf$/i.test(fileName);
      const configuredProviderRaw = (process.env.OCR_PROVIDER || "paddle").trim().toLowerCase();
      const provider = ["typhoon", "paddle", "paddle_vl", "text"].includes(configuredProviderRaw)
        ? configuredProviderRaw
        : "paddle";

      const body = await runOcrExtract({
        buffer: req.file.buffer,
        fileName,
        contentType,
        provider,
      });

      const text = (body?.text || "").trim();
      const blocks = Array.isArray(body?.blocks) && body.blocks.length > 0
        ? body.blocks
        : (text ? [{ text, label: "Content" }] : []);

      res.json({
        ok: true,
        filename: fileName,
        text,
        blocks,
        metadata: body?.metadata || {},
      });
    } catch (e) {
      const msg = e?.message || String(e);
      console.error("[internal/ocr-extract] error:", msg);
      res.status(503).json({ ok: false, error: msg });
    }
  }
);

export const internalRouter = router;
