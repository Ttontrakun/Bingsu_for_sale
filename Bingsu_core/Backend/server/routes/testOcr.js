/**
 * หน้าเทส OCR เท่านั้น — ไม่ยุ่งกับระบบหลัก
 * - POST /api/test/ocr-extract: ไฟล์ PDF/รูป → proxy ไป OCR API
 * - POST /api/test/ocr-clean: ข้อความ → LLM จัดรูปแบบ
 * - POST /api/test/ocr-structure: ข้อความ → LLM จัดโครงสร้าง (หัวข้อ ย่อหน้า รายการ)
 */
import { Router } from "express";
import { runOcrExtract } from "../services/uploadQueue.js";
import { cleanOcrTextWithLlm, structureOcrTextWithLlm } from "../services/chat.js";

const router = Router();

/** เทสเท่านั้น — เรียก LLM จัดโครงสร้าง (ใช้ฟังก์ชันเดียวกับ upload flow) */
async function structureTextForTest(text) {
  return structureOcrTextWithLlm(text);
}

router.post("/ocr-extract", async (req, res) => {
  try {
    const { fileBase64, fileName, contentType, maxPages, dpi } = req.body || {};
    if (!fileBase64) {
      return res.status(400).json({ ok: false, error: "ต้องส่ง fileBase64" });
    }
    const buffer = Buffer.from(fileBase64, "base64");
    const name = fileName && typeof fileName === "string" ? fileName : "document.pdf";
    const isPdf = /\.pdf$/i.test(name) || (contentType && String(contentType).toLowerCase().includes("pdf"));
    const type = contentType && typeof contentType === "string" ? contentType : isPdf ? "application/pdf" : "application/pdf";
    const pages = isPdf && maxPages != null ? Math.max(1, Math.min(30, parseInt(maxPages, 10) || 30)) : undefined;
    const dpiNum = dpi != null ? Math.max(72, Math.min(300, parseInt(dpi, 10) || 200)) : undefined;
    const result = await runOcrExtract({
      buffer,
      fileName: name,
      contentType: type,
      maxPages: pages,
      dpi: dpiNum,
    });
    return res.json(result);
  } catch (e) {
    console.error("Test OCR extract error:", e);
    return res.status(500).json({ ok: false, error: e.message || "OCR failed" });
  }
});

router.post("/ocr-clean", async (req, res) => {
  try {
    const { text } = req.body || {};
    const result = await cleanOcrTextWithLlm(text ? String(text) : "");
    const cleaned = typeof result === "object" && result?.text != null ? result.text : result;
    return res.json({ ok: true, text: cleaned, cleaned: typeof result === "object" ? result.cleaned : undefined });
  } catch (e) {
    console.error("Test OCR clean error:", e);
    return res.status(500).json({ ok: false, error: e.message || "LLM clean failed" });
  }
});

router.post("/ocr-structure", async (req, res) => {
  try {
    const { text } = req.body || {};
    const structured = await structureTextForTest(text ? String(text) : "");
    return res.json({ ok: true, text: structured });
  } catch (e) {
    console.error("Test OCR structure error:", e);
    return res.status(500).json({ ok: false, error: e.message || "LLM structure failed" });
  }
});

export const testOcrRouter = router;
