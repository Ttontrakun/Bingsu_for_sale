/**
 * ทดสอบ OCR ผ่าน API + optional LLM cleanup
 * ใช้เมื่อมี FastAPI backend รันอยู่แล้ว (หรือใช้ Docker)
 *
 * แนะนำถ้าไม่อยากใช้ Docker: ทดสอบแค่ PaddleOCR หนึ่งหน้าในเครื่อง
 *   cd askaa_backend
 *   pip install -r backend/requirements.txt
 *   python backend/scripts/run_ocr_local.py <path-to-pdf>
 *   # หรือ หลายหน้า: python backend/scripts/run_ocr_local.py <path-to-pdf> 5
 *
 * ใช้สคริปต์นี้เมื่อมี API รันอยู่:
 *   node server/scripts/test-ocr.js <path-to-pdf> [--with-llm]
 *   node server/scripts/test-ocr.js <path-to-pdf> --with-llm --llm-per-page   # clean แยกแต่ละหน้า (ได้โครงสร้างแบ่งหน้า)
 */
import fs from "fs/promises";
import path from "path";
import "../config.js";
import { ocrLlmCleanup } from "../config.js";
import { cleanOcrTextWithLlm } from "../services/chat.js";

const OCR_API_URL = (process.env.OCR_API_URL || "http://localhost:5051").replace(/\/+$/, "");
const OCR_LANG = process.env.OCR_LANG || "th";
const OCR_MAX_PAGES = Number(process.env.OCR_MAX_PAGES || 30);
const OCR_DPI = Number(process.env.OCR_DPI || 200);
const OCR_USE_ANGLE_CLS = (process.env.OCR_USE_ANGLE_CLS || "true") === "true";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node server/scripts/test-ocr.js <path-to-pdf> [--with-llm]");
  process.exit(1);
}
const withLlm = process.argv.includes("--with-llm") || ocrLlmCleanup;

async function main() {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const fileName = path.basename(fullPath);

  let buffer;
  try {
    buffer = await fs.readFile(fullPath);
  } catch (e) {
    console.error("อ่านไฟล์ไม่ได้:", e.message);
    process.exit(1);
  }

  console.log("ไฟล์:", fileName, "ขนาด:", (buffer.length / 1024).toFixed(1), "KB");
  console.log("เรียก OCR ที่", OCR_API_URL + "/api/ocr/extract", "\n");

  // --- OCR ---
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/pdf" }), fileName);
  form.append("lang", OCR_LANG);
  form.append("max_pages", String(OCR_MAX_PAGES));
  form.append("dpi", String(OCR_DPI));
  form.append("use_angle_cls", String(OCR_USE_ANGLE_CLS));

  const t0 = Date.now();
  const ocrTimeoutMs = Number(process.env.OCR_TEST_TIMEOUT_MS || 600000); // 10 min default (first run may download models)
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), ocrTimeoutMs);
  let res;
  try {
    res = await fetch(OCR_API_URL + "/api/ocr/extract", { method: "POST", body: form, signal: controller.signal });
  } catch (e) {
    clearTimeout(to);
    console.error("เรียก OCR ไม่ได้ (เช็คว่า FastAPI backend รันอยู่ที่", OCR_API_URL + "):", e.message);
    process.exit(1);
  }
  clearTimeout(to);
  const ocrMs = Date.now() - t0;

  if (!res.ok) {
    console.error("OCR error", res.status, await res.text());
    process.exit(1);
  }

  const data = await res.json();
  if (!data.ok) {
    console.error("OCR returned ok: false", data.error || data);
    process.exit(1);
  }

  const rawText = (data.text || "").trim();
  const pages = Array.isArray(data.pages) ? data.pages : [];
  const pageCount = pages.length;

  const maxShowPerPage = 800;
  const pageSep = "════════════ หน้า %d ════════════";

  // --- สรุปความเร็ว (ส่วนแรกให้เห็นเลย) ---
  console.log("--- ความเร็ว (Paddle OCR) ---");
  console.log("  Paddle OCR:", (ocrMs / 1000).toFixed(2), "วินาที  |  จำนวนหน้า:", pageCount, "  |  ตัวอักษร:", rawText.length);
  console.log("");

  // --- ข้อความจาก OCR แบบแบ่งหน้า (มีโครงสร้าง) ---
  console.log("--- ข้อความจาก Paddle OCR (แบ่งตามหน้า) ---");
  if (pages.length > 0) {
    for (const p of pages) {
      const num = p.page ?? "?";
      const txt = String(p.text || "").trim();
      console.log(pageSep.replace("%d", num));
      console.log(txt ? txt.slice(0, maxShowPerPage) + (txt.length > maxShowPerPage ? "\n... (ตัดแสดง)" : "") : "(ไม่มีข้อความ)");
      console.log("");
    }
  } else {
    console.log(rawText ? rawText.slice(0, 2500) + (rawText.length > 2500 ? "\n\n... (ตัดแสดง)" : "") : "(ไม่มีข้อความ)");
  }
  console.log("");

  let llmMs = 0;
  if (withLlm && rawText) {
    console.log("--- LLM cleanup (จัดรูปแบบ/แก้คำผิด) ---");
    const t1 = Date.now();
    const perPageLlm = process.argv.includes("--llm-per-page");
    let cleanedByPage;
    let cleanedMerged;
    if (perPageLlm && pages.length > 0) {
      cleanedByPage = [];
      for (let i = 0; i < pages.length; i++) {
        const pt = String(pages[i]?.text || "").trim();
        const res = pt ? await cleanOcrTextWithLlm(pt) : "";
        cleanedByPage.push(typeof res === "object" && res?.text != null ? res.text : res);
      }
      llmMs = Date.now() - t1;
      console.log("  ใช้เวลา:", (llmMs / 1000).toFixed(2), "วินาที (clean แยกแต่ละหน้า)");
      console.log("");
      console.log("--- ข้อความหลัง LLM (แบ่งตามหน้า) ---");
      cleanedByPage.forEach((txt, i) => {
        const num = pages[i]?.page ?? i + 1;
        console.log(pageSep.replace("%d", num));
        console.log(txt.slice(0, maxShowPerPage) + (txt.length > maxShowPerPage ? "\n... (ตัดแสดง)" : ""));
        console.log("");
      });
    } else {
      const res = await cleanOcrTextWithLlm(rawText);
      cleanedMerged = typeof res === "object" && res?.text != null ? res.text : res;
      llmMs = Date.now() - t1;
      console.log("  ใช้เวลา:", (llmMs / 1000).toFixed(2), "วินาที");
      console.log("  ตัวอักษรหลัง clean:", cleanedMerged.length);
      console.log("");
      console.log("--- ข้อความหลัง LLM (รวมหนึ่งก้อน) ---");
      const maxShow = 2500;
      console.log(cleanedMerged.slice(0, maxShow) + (cleanedMerged.length > maxShow ? "\n\n... (ตัดแสดง)" : ""));
    }
  } else if (withLlm && !rawText) {
    console.log("ไม่มีข้อความจาก OCR จึงไม่รัน LLM cleanup");
  }

  // --- สรุปความเร็วสุดท้าย ---
  console.log("");
  console.log("--- สรุปความเร็ว (Paddle + LLM) ---");
  console.log("  Paddle OCR:", (ocrMs / 1000).toFixed(2), "s");
  if (withLlm && rawText) {
    console.log("  LLM cleanup:", (llmMs / 1000).toFixed(2), "s");
    console.log("  รวม:", ((ocrMs + llmMs) / 1000).toFixed(2), "s");
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
