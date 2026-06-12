/**
 * Internal endpoints — ใช้เมื่อ Bing Website โฟร์วาร์ดคำขอ OCR มา (ไม่ต้อง auth แบบ session)
 * POST /api/internal/ocr-extract = รับไฟล์ ทำ OCR ด้วย runOcrExtract ส่งกลับ format Bing
 */
import express from "express";
import multer from "multer";
import { runOcrExtract } from "../services/uploadQueue.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

function checkInternalKey(req, res, next) {
  const key = process.env.ASKAA_INTERNAL_KEY;
  if (!key) return next();
  const sent = req.headers["x-internal-key"];
  if (sent !== key) {
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
      const provider = isPdf ? "typhoon" : "paddle";

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
