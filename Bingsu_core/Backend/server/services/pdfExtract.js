/**
 * เอนจินดึงข้อความ PDF + OCR (pdfplumber / pdfjs / Typhoon / Paddle ผ่าน OCR API)
 * ย้ายมาจาก services/uploadQueue.js (refactor แยกไฟล์ ไม่เปลี่ยนพฤติกรรม)
 * uploadQueue.js ยัง re-export ชื่อเดิม (runOcrExtract, previewPdfStructure, getPdfPageDetection) ให้ route เดิมใช้ได้
 */
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildBlocksFromText } from "./text.js";
import { cleanOcrTextWithLlm, postProcessOcrText } from "./chat.js";
import { extractExcelText, isExcelFile } from "./excel.js";
import {
  ocrAlwaysForPdf,
  ocrLlmCleanup,
  ocrLlmProvider,
  pdfProvider,
  strictPrivacyMode,
} from "../config.js";

export const OCR_API_URL = (process.env.OCR_API_URL || "").replace(/\/+$/, "");
export const OCR_ENABLED = (process.env.OCR_ENABLED || "true") === "true";
const OCR_LANG = process.env.OCR_LANG || "th";
const OCR_MAX_PAGES = Number(process.env.OCR_MAX_PAGES || 30);
const OCR_DPI = Number(process.env.OCR_DPI || 200);
const OCR_USE_ANGLE_CLS = (process.env.OCR_USE_ANGLE_CLS || "true") === "true";
const OCR_PROVIDER_DEFAULT_RAW = (process.env.OCR_PROVIDER || "paddle").trim().toLowerCase();
const OCR_PROVIDER_DEFAULT = ["typhoon", "paddle", "paddle_vl", "text"].includes(OCR_PROVIDER_DEFAULT_RAW)
  ? OCR_PROVIDER_DEFAULT_RAW
  : "paddle";
export const OCR_MIN_TEXT_CHARS = Number(process.env.OCR_MIN_TEXT_CHARS || 400);
/** เอกสารผสม: จำกัดจำนวนหน้าที่ส่งให้ LLM ขัดข้อความรายหน้า กันค่าใช้จ่ายบานปลาย */
const OCR_LLM_CLEANUP_MAX_PAGES = Number(process.env.OCR_LLM_CLEANUP_MAX_PAGES || 10);
/** เกณฑ์ต่อหน้า: ถ้าดึงข้อความได้น้อยกว่านี้ถือว่าหน้าเป็น "ภาพ" (สแกน) ใช้ Typhoon เฉพาะหน้านั้น */
const OCR_MIN_TEXT_CHARS_PER_PAGE = Number(process.env.OCR_MIN_TEXT_CHARS_PER_PAGE || 50);
/** Open Typhoon OCR (api.opentyphoon.ai/v1/ocr): ต้องตั้ง TYPHOON_OCR_API_KEY. ตัวเลือก: TYPHOON_OCR_API_URL, TYPHOON_OCR_MODEL, TYPHOON_OCR_TASK_TYPE, TYPHOON_OCR_MAX_TOKENS, TYPHOON_OCR_TEMPERATURE, TYPHOON_OCR_TOP_P, TYPHOON_OCR_REPETITION_PENALTY */
export const TYPHOON_OCR_API_URL = (process.env.TYPHOON_OCR_API_URL || "https://api.opentyphoon.ai/v1/ocr").replace(/\/+$/, "");
const TYPHOON_OCR_API_KEY = (process.env.TYPHOON_OCR_API_KEY || process.env.OPENAI_API_KEY || "").trim();
const TYPHOON_OCR_MODEL = process.env.TYPHOON_OCR_MODEL || "typhoon-ocr";
const TYPHOON_OCR_TASK_TYPE = process.env.TYPHOON_OCR_TASK_TYPE || "default";
const TYPHOON_OCR_MAX_TOKENS = Number(process.env.TYPHOON_OCR_MAX_TOKENS || 16384);
const TYPHOON_OCR_TEMPERATURE = Number(process.env.TYPHOON_OCR_TEMPERATURE || 0.1);
const TYPHOON_OCR_TOP_P = Number(process.env.TYPHOON_OCR_TOP_P || 0.6);
const TYPHOON_OCR_REPETITION_PENALTY = Number(process.env.TYPHOON_OCR_REPETITION_PENALTY || 1.2);

// โฟลเดอร์เดียวกับ uploadQueue — ใช้เป็นที่พักไฟล์ชั่วคราวตอนเรียก pdfplumber
const uploadRoot = path.join(process.cwd(), ".uploads");
fs.mkdir(uploadRoot, { recursive: true }).catch(() => null);

/** หา path ของสคริปต์ pdfplumber (ลองตามลำดับ) */
const resolvePlumberScriptPath = async () => {
  const candidates = [
    process.env.PDF_PLUMBER_SCRIPT_PATH,
    path.join(process.cwd(), "scripts", "extract_pdf_plumber.py"),
    path.join(process.cwd(), "Service", "Website", "scripts", "extract_pdf_plumber.py"),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {
      /* try next */
    }
  }
  return null;
};

const PLUMBER_PAGE_MARKER = /^===PLUMBER_PAGE:(\d+)===\s*$/;

/** แยกผลลัพธ์ plumber เป็นรายหน้า — สคริปต์รุ่นเก่าไม่มีบรรทัดคั่นจะได้ [] กลับไป */
const parsePlumberPages = (body) => {
  const pages = [];
  let current = null;
  for (const line of String(body || "").split("\n")) {
    const marker = line.match(PLUMBER_PAGE_MARKER);
    if (marker) {
      if (current) pages.push(current);
      current = { page: Number(marker[1]), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) pages.push(current);
  return pages.map(({ page, lines }) => ({ page, text: lines.join("\n").trim() }));
};

/** ดึงข้อความจาก PDF ด้วย Python pdfplumber */
const extractPdfTextWithPlumber = async (buffer, scriptPath) => {
  const pythonCmd = process.env.PYTHON_PATH || "python3";
  if (!scriptPath) {
    throw new Error("pdfplumber: script path missing");
  }
  try {
    await fs.access(scriptPath);
  } catch {
    throw new Error(`pdfplumber script not found: ${scriptPath}`);
  }
  const tmpPath = path.join(uploadRoot, `plumber-${crypto.randomUUID()}.pdf`);
  await fs.writeFile(tmpPath, buffer);
  try {
    const result = await new Promise((resolve, reject) => {
      const proc = spawn(pythonCmd, [scriptPath, tmpPath], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      proc.stdout?.on("data", (d) => { stdout += d.toString(); });
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code !== 0) reject(new Error(stderr || `exit ${code}`));
        else resolve(stdout);
      });
    });
    const firstLine = result.split("\n")[0] || "";
    const pageMatch = firstLine.match(/^PAGES:(\d+)$/);
    const pageCount = pageMatch ? parseInt(pageMatch[1], 10) : 0;
    const body = pageMatch ? result.slice(result.indexOf("\n") + 1) : result;
    const pages = parsePlumberPages(body);
    const text = pages.length
      ? pages.map(({ text: pageText }) => pageText).filter(Boolean).join("\n\n")
      : body.trim();
    return { text, pageCount, pages };
  } finally {
    await fs.unlink(tmpPath).catch(() => null);
  }
};

const extractPdfPageText = async (page) => {
  const content = await page.getTextContent();
  return content.items
    .map((item) => {
      if (!("str" in item)) return "";
      const text = item.str ?? "";
      const hasEol = "hasEOL" in item && item.hasEOL;
      return text + (hasEol ? "\n" : " ");
    })
    .join("")
    .trim();
};

export const copyBinaryData = (data) => {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    return new Uint8Array(data);
  }
  if (data instanceof Uint8Array) {
    return new Uint8Array(data);
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data.slice(0));
  }
  return data;
};

export const extractPdfText = async (buffer) => {
  const tryPlumberFirst = (process.env.PDF_TRY_PLUMBER_FIRST || "true").toLowerCase() !== "false";
  const wantPlumber = pdfProvider === "pdfplumber" || tryPlumberFirst;
  if (wantPlumber) {
    const scriptPath =
      pdfProvider === "pdfplumber"
        ? (await resolvePlumberScriptPath()) ||
          process.env.PDF_PLUMBER_SCRIPT_PATH ||
          path.join(process.cwd(), "scripts", "extract_pdf_plumber.py")
        : await resolvePlumberScriptPath();
    if (scriptPath) {
      try {
        const { text, pageCount, pages } = await extractPdfTextWithPlumber(buffer, scriptPath);
        const blocks = text ? buildBlocksFromText(text, "pdfplumber") : [];
        return { text: text || "", blocks, pageCount, pages: pages || [], engine: "pdfplumber" };
      } catch (e) {
        console.warn("[uploadQueue] pdfplumber failed, using pdfjs:", e?.message || e);
        if (pdfProvider === "pdfplumber") {
          console.warn("[uploadQueue] PDF_PROVIDER=pdfplumber but plumber failed — falling back to pdfjs");
        }
      }
    } else if (pdfProvider === "pdfplumber") {
      console.warn("[uploadQueue] PDF_PROVIDER=pdfplumber but extract_pdf_plumber.py not found — using pdfjs");
    }
  }
  const pdfData = copyBinaryData(buffer);
  const pdf = await getDocument({ data: pdfData, disableWorker: true }).promise;
  const blocks = [];
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const pageText = await extractPdfPageText(page);
    pages.push({ page: pageNumber, text: pageText || "" });
    if (pageText) {
      blocks.push(...buildBlocksFromText(pageText, `Page ${pageNumber}`));
    }
  }
  const text = blocks.map((block) => block.text).join("\n\n");
  return { text, blocks, pageCount: pdf.numPages, pages, engine: "pdfjs" };
};

/** ดึงข้อความแยกต่อหน้า (pdfjs) — ใช้ตรวจจับว่าหน้าไหนเป็นภาพ/เทค */
const extractPdfTextPerPage = async (buffer) => {
  const pdfData = copyBinaryData(buffer);
  const pdf = await getDocument({ data: pdfData, disableWorker: true }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const pageText = await extractPdfPageText(page);
    pages.push({ page: pageNumber, text: pageText || "" });
  }
  return { pages, pageCount: pdf.numPages };
};

/**
 * ตรวจจับว่าหน้าไหนเป็น "ภาพ" (สแกน) ไหนเป็น "เทค" (ตัวหนังสือ)
 * คืนค่า: imagePageNumbers = เลขหน้าที่ดึงข้อความได้น้อย (ใช้ Typhoon), textByPage = [{ page, text }] สำหรับหน้าที่เป็นเทค
 */
export const getPdfPageDetection = async (buffer) => {
  const { pages, pageCount } = await extractPdfTextPerPage(buffer);
  const { imagePageNumbers, textPages } = classifyPdfPages({ pages, pageCount });
  return { imagePageNumbers, textByPage: textPages, pageCount };
};

/**
 * แบ่งหน้าเป็น 2 กลุ่มจากปริมาณ text layer ที่ดึงได้
 * - textPages = หน้าที่อ่านตัวหนังสือจากไฟล์ได้ตรงๆ (แม่นกว่า OCR เพราะเป็นอักขระจริง)
 * - imagePageNumbers = หน้าที่เป็นภาพ/สแกน ต้องส่งไป OCR
 * OCR_ALWAYS_FOR_PDF=true จะบังคับให้ทุกหน้าถือเป็นหน้าภาพ
 */
const classifyPdfPages = ({ pages = [], pageCount = 0 } = {}) => {
  const textByPage = new Map();
  for (const { page, text } of pages) {
    const number = Number(page);
    if (Number.isFinite(number) && number > 0) textByPage.set(number, String(text || "").trim());
  }
  const total = pageCount || textByPage.size;
  const imagePageNumbers = [];
  const textPages = [];
  for (let page = 1; page <= total; page += 1) {
    const text = textByPage.get(page) || "";
    const length = text.replace(/\s+/g, "").length;
    if (ocrAlwaysForPdf || length < OCR_MIN_TEXT_CHARS_PER_PAGE) {
      imagePageNumbers.push(page);
    } else {
      textPages.push({ page, text });
    }
  }
  return { imagePageNumbers, textPages, textByPage, total };
};

export const shouldRunOcrForPdf = ({ text = "", pageCount = 0, pages = [] } = {}) => {
  if (!OCR_ENABLED) return false;
  if (!OCR_API_URL && !TYPHOON_OCR_API_URL) return false;
  if (!pageCount) return false;
  if (ocrAlwaysForPdf) return true;
  // รู้ข้อความรายหน้า: ตัดสินทีละหน้า เอกสารดิจิทัลที่แทรกหน้าสแกนไว้จะไม่หลุด
  if (Array.isArray(pages) && pages.length > 0) {
    return classifyPdfPages({ pages, pageCount }).imagePageNumbers.length > 0;
  }
  const normalized = String(text || "").replace(/\s+/g, "").trim();
  return normalized.length < OCR_MIN_TEXT_CHARS;
};

function buildOcrForm(buffer, fileName, contentType, options = {}) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([buffer], { type: contentType || "application/pdf" }),
    fileName || "document.pdf",
  );
  form.append("model", options.model ?? TYPHOON_OCR_MODEL);
  form.append("task_type", options.taskType ?? TYPHOON_OCR_TASK_TYPE);
  form.append("max_tokens", String(options.maxTokens ?? TYPHOON_OCR_MAX_TOKENS));
  form.append("temperature", String(options.temperature ?? TYPHOON_OCR_TEMPERATURE));
  form.append("top_p", String(options.topP ?? TYPHOON_OCR_TOP_P));
  form.append("repetition_penalty", String(options.repetitionPenalty ?? TYPHOON_OCR_REPETITION_PENALTY));
  if (options.pages && Array.isArray(options.pages) && options.pages.length > 0) {
    form.append("pages", JSON.stringify(options.pages));
  }
  return form;
}

/** แปลงตาราง HTML จาก Typhoon ให้เป็น markdown ก่อนเก็บ/แสดงผล */
function normalizeTyphoonOcrResult(result) {
  if (!result || typeof result !== "object") return result;
  const pages = Array.isArray(result.pages)
    ? result.pages.map((page) =>
        page && typeof page === "object"
          ? { ...page, text: postProcessOcrText(String(page.text || "").trim()) }
          : page,
      )
    : result.pages;
  return {
    ...result,
    text: postProcessOcrText(String(result.text || "").trim()),
    pages,
  };
}

/** ล้างผล OCR จาก Typhoon — เอา metadata/code ออก แล้วแปลงตาราง HTML เป็น markdown */
function cleanTyphoonOcrOutput(content) {
  let text = String(content || "").trim();
  text = text.replace(/<figure>[\s\S]*?<\/figure>\s*/gi, "");
  text = text.replace(/```[\w]*\n[\s\S]*?```\s*/g, "");
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return postProcessOcrText(text);
}

/** เรียก Open Typhoon OCR API (api.opentyphoon.ai/v1/ocr) — ส่ง model, task_type, max_tokens, temperature, top_p, repetition_penalty, pages ตาม spec. pageNumbers = ส่งเฉพาะเลขหน้าที่จะ OCR (ถ้าไม่ส่ง = ทุกหน้า) */
async function callTyphoonOcrDirect({ buffer, fileName, contentType, maxPages, pageNumbers }) {
  if (!TYPHOON_OCR_API_URL || !TYPHOON_OCR_API_KEY) return null;
  const timeoutMs = Number(process.env.OCR_EXTRACT_TIMEOUT_MS || 300000);
  const pages =
    Array.isArray(pageNumbers) && pageNumbers.length > 0
      ? pageNumbers
      : Array.from({ length: Math.max(1, Math.min(maxPages ?? OCR_MAX_PAGES, 999)) }, (_, i) => i + 1);

  const tryFetch = async (url, headers) => {
    const form = buildOcrForm(buffer, fileName, contentType, { pages });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        body: form,
        signal: controller.signal,
        headers: { ...headers },
      });
      clearTimeout(timeoutId);
      return res;
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  };

  const parseResponse = async (response) => {
    const raw = await response.text();
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {
      body = {};
    }
    if (!response.ok) {
      const msg = body.error || body.message || body.detail || raw || `Typhoon API ${response.status}`;
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    const results = body.results;
    if (Array.isArray(results) && results.length > 0) {
      const extractedTexts = [];
      const pagesOut = [];
      for (let i = 0; i < results.length; i++) {
        const pageResult = results[i];
        const pageNum = Array.isArray(pageNumbers) && pageNumbers[i] != null ? pageNumbers[i] : i + 1;
        if (pageResult?.success && pageResult?.message?.choices?.[0]?.message?.content) {
          let content = pageResult.message.choices[0].message.content;
          try {
            const parsed = JSON.parse(content);
            if (typeof parsed.natural_text === "string") content = parsed.natural_text;
          } catch {
            // ใช้ content เดิม
          }
          content = cleanTyphoonOcrOutput(content);
          extractedTexts.push(content);
          pagesOut.push({ page: pageNum, text: content });
        }
      }
      const text = extractedTexts.join("\n").trim();
      return { ok: true, text: text || "", pages: pagesOut };
    }
    const text = (body.text ?? body.content ?? body.result ?? "").trim();
    if (body.choices?.[0]?.message?.content) {
      return { ok: true, text: (body.choices[0].message.content || text).trim(), pages: body.pages || [] };
    }
    return { ok: true, text: text || raw.trim(), pages: body.pages || [] };
  };

  const authBearer = { Authorization: `Bearer ${TYPHOON_OCR_API_KEY}` };

  let response;
  try {
    response = await tryFetch(TYPHOON_OCR_API_URL, authBearer);
  } catch (e) {
    console.warn("[uploadQueue] Typhoon direct OCR failed:", e?.message || e);
    return null;
  }

  if (response.status === 404 && TYPHOON_OCR_API_URL.includes("/api/v1/")) {
    const altUrl = TYPHOON_OCR_API_URL.replace("/api/v1/", "/v1/");
    console.warn("[uploadQueue] 404 at configured URL, trying alternate:", altUrl);
    try {
      response = await tryFetch(altUrl, authBearer);
    } catch (e) {
      console.warn("[uploadQueue] Typhoon alternate URL failed:", e?.message || e);
      return null;
    }
  }

  return normalizeTyphoonOcrResult(await parseResponse(response));
}

export const runOcrExtract = async ({
  buffer,
  fileName,
  contentType,
  maxPages,
  dpi,
  provider,
  pageNumbers,
  /** ตั้ง true เมื่อ caller เรียก extractPdfText แล้วและรู้ว่าต้อง OCR (ลดการดึง PDF ซ้ำ) */
  skipNativePdfProbe = false,
}) => {
  const name = fileName || "document.pdf";
  const type = contentType || "application/pdf";
  const providerRaw = String(provider || OCR_PROVIDER_DEFAULT).trim().toLowerCase();
  let ocrProvider = ["typhoon", "paddle", "paddle_vl", "text"].includes(providerRaw)
    ? providerRaw
    : OCR_PROVIDER_DEFAULT;
  const isPdfUpload = String(type).toLowerCase().includes("pdf") || /\.pdf$/i.test(String(name));
  if (strictPrivacyMode && ocrProvider === "typhoon") {
    // In strict privacy mode, force local/internal OCR if system default is local.
    if (OCR_PROVIDER_DEFAULT !== "typhoon") {
      console.warn(
        `[uploadQueue] STRICT_PRIVACY_MODE=true: requested provider="${providerRaw}" overridden to "${OCR_PROVIDER_DEFAULT}" for ${name}`,
      );
      ocrProvider = OCR_PROVIDER_DEFAULT;
    } else {
      throw new Error("STRICT_PRIVACY_MODE=true: external OCR is blocked. Use text extraction only or internal OCR service.");
    }
  }
  if (isPdfUpload && ocrProvider === "typhoon" && !TYPHOON_OCR_API_KEY) {
    throw new Error("PDF สแกนต้องใช้ Typhoon OCR: กรุณาตั้ง TYPHOON_OCR_API_KEY ใน Backend/.env");
  }

  // PDF: ลองดึง text layer ก่อน (pdfplumber ถ้ามีสคริปต์ → ไม่เช่นนั้น pdf.js) ถ้าได้ข้อความเพียงพอจะไม่เรียก Typhoon (เอกสารที่พิมพ์/มีเลเยอร์ข้อความ)
  const pdfTryNativeBeforeTyphoon =
    !skipNativePdfProbe &&
    isPdfUpload &&
    ocrProvider === "typhoon" &&
    (process.env.PDF_TRY_TEXT_BEFORE_TYPHOON_OCR || "true").toLowerCase() !== "false";
  if (pdfTryNativeBeforeTyphoon) {
    try {
      const { text, blocks, pageCount, engine } = await extractPdfText(buffer);
      const normalizedLen = String(text || "").replace(/\s+/g, "").trim().length;
      const minChars = Number(process.env.OCR_MIN_TEXT_CHARS || 400);
      if (pageCount > 0 && normalizedLen >= minChars) {
        const source = engine === "pdfplumber" ? "pdfplumber" : "pdfjs";
        console.log(
          `[uploadQueue] PDF native text (${source}, ${normalizedLen} chars ≥ ${minChars}) — skip Typhoon OCR:`,
          name,
        );
        return {
          text: String(text || "").trim(),
          blocks:
            Array.isArray(blocks) && blocks.length
              ? blocks
              : text
                ? [{ text: String(text).trim(), label: "Content" }]
                : [],
          metadata: { source, extraction: "native_text" },
        };
      }
      console.log(
        `[uploadQueue] PDF native text insufficient (${normalizedLen} < ${minChars}) — Typhoon OCR:`,
        name,
      );
    } catch (e) {
      console.warn("[uploadQueue] PDF native extraction failed, will try Typhoon:", e?.message || e);
    }
  }

  // PDF สแกน / ไม่มี text layer: ใช้ Typhoon OCR โดยตรง (ไม่ผ่าน FastAPI). pageNumbers = ส่งเฉพาะหน้าที่เป็นภาพ
  if (isPdfUpload && ocrProvider === "typhoon" && TYPHOON_OCR_API_URL && TYPHOON_OCR_API_KEY) {
    try {
      console.log("[uploadQueue] PDF → Typhoon OCR:", name);
      const result = await callTyphoonOcrDirect({ buffer, fileName: name, contentType: type, maxPages, pageNumbers });
      if (result && (result.text || (result.pages && result.pages.length))) {
        return { ...result, metadata: { ...(result.metadata || {}), source: "typhoon" } };
      }
    } catch (e) {
      console.warn("[uploadQueue] Typhoon direct for PDF failed, falling back to OCR_API_URL:", e?.message || e);
    }
  }

  // รูปภาพ/ไฟล์อื่น + ส่ง provider typhoon มา
  if (!isPdfUpload && ocrProvider === "typhoon" && TYPHOON_OCR_API_URL && TYPHOON_OCR_API_KEY) {
    try {
      console.log("[uploadQueue] Image → Typhoon OCR:", name);
      const result = await callTyphoonOcrDirect({ buffer, fileName: name, contentType: type, maxPages, pageNumbers });
      if (result && (result.text || (result.pages && result.pages.length))) {
        return { ...result, metadata: { ...(result.metadata || {}), source: "typhoon" } };
      }
    } catch (e) {
      console.warn("[uploadQueue] Typhoon direct failed, falling back to OCR_API_URL:", e?.message || e);
    }
  }

  if (!OCR_API_URL) {
    throw new Error(
      "OCR ไม่พร้อม: ตั้ง OCR_API_URL (หรือใช้ Typhoon โดยตั้ง TYPHOON_OCR_API_URL และ TYPHOON_OCR_API_KEY ใน Backend/.env)"
    );
  }
  const url = `${OCR_API_URL}/api/ocr/extract`;
  const form = new FormData();
  form.append(
    "file",
    new Blob([buffer], { type }),
    name,
  );
  form.append("lang", OCR_LANG);
  form.append("max_pages", String(maxPages != null ? maxPages : OCR_MAX_PAGES));
  form.append("dpi", String(dpi != null ? dpi : OCR_DPI));
  form.append("use_angle_cls", String(OCR_USE_ANGLE_CLS));
  if (ocrProvider === "typhoon" || ocrProvider === "paddle" || ocrProvider === "paddle_vl" || ocrProvider === "text") {
    form.append("provider", ocrProvider);
  }

  const timeoutMs = ocrProvider === "text" ? 180000 : Number(process.env.OCR_EXTRACT_TIMEOUT_MS || 300000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const ocrServiceKey = (process.env.OCR_SERVICE_API_KEY || "").trim();
  const ocrHeaders = ocrServiceKey
    ? { Authorization: `Bearer ${ocrServiceKey}`, "X-API-Key": ocrServiceKey }
    : undefined;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      body: form,
      signal: controller.signal,
      ...(ocrHeaders ? { headers: ocrHeaders } : {}),
    });
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e?.message || String(e);
    if (/fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|bad address|aborted/i.test(msg)) {
      const serviceName = ocrProvider === "text" ? "API (ดึง text)" : "OCR (API)";
      throw new Error(
        `ไม่สามารถเชื่อมต่อ ${serviceName} ได้ — ตรวจสอบว่า container api รันอยู่และ OCR_API_URL ถูกต้อง (ปัจจุบัน: ${OCR_API_URL || "ไม่ตั้งค่า"}). ${msg} ลองกดอีกครั้งหรือถ้า api แสดง Exited (137) = OOM ให้เพิ่ม RAM ให้ Docker`
      );
    }
    throw e;
  }
  clearTimeout(timeoutId);
  const body = await response.json().catch(async () => ({ error: await response.text().catch(() => "") }));
  if (!response.ok) {
    const msg = body.error || body.detail || (Array.isArray(body.detail) ? body.detail.map((d) => d.msg || d).join("; ") : null) || `OCR request failed: ${response.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  if (body && body.ok === false && body.error) {
    throw new Error(body.error);
  }
  return ocrProvider === "typhoon" ? normalizeTyphoonOcrResult(body) : body;
};

/**
 * อ่าน PDF แบบผสมรายหน้า: หน้าที่มี text layer ใช้อักขระจริงจากไฟล์ (ไม่มีทางอ่านผิด)
 * ส่วนหน้าที่เป็นภาพ/สแกนส่งไป OCR เฉพาะหน้านั้น แล้วประกอบกลับตามลำดับหน้า
 * คืน null เมื่อไม่มีหน้าไหนต้อง OCR — ให้ผู้เรียกใช้ข้อความจาก text layer ตามเดิม
 */
export const extractPdfTextHybrid = async ({ buffer, fileName, contentType, pages, pageCount, onProgress }) => {
  const { imagePageNumbers, textByPage, total } = classifyPdfPages({ pages, pageCount });
  if (!imagePageNumbers.length || !total) return null;

  const targetPages = imagePageNumbers.slice(0, OCR_MAX_PAGES);
  const allScanned = targetPages.length === total;
  if (typeof onProgress === "function") {
    onProgress(
      allScanned
        ? `Running ${OCR_PROVIDER_DEFAULT} OCR (PDF สแกน ${targetPages.length} หน้า)...`
        : `Running ${OCR_PROVIDER_DEFAULT} OCR เฉพาะหน้าที่เป็นภาพ (${targetPages.length}/${total} หน้า)...`,
    );
  }

  const ocrResult = await runOcrExtract({
    buffer,
    fileName,
    contentType,
    provider: OCR_PROVIDER_DEFAULT,
    pageNumbers: targetPages,
    skipNativePdfProbe: true,
  });

  const ocrTextByPage = new Map();
  for (const item of Array.isArray(ocrResult?.pages) ? ocrResult.pages : []) {
    const number = Number(item?.page);
    const text = postProcessOcrText(String(item?.text || "").trim());
    if (Number.isFinite(number) && number > 0 && text) ocrTextByPage.set(number, text);
  }
  // ผู้ให้บริการบางรายคืนข้อความรวมก้อนเดียวโดยไม่แยกหน้า — ใช้ได้เมื่อขอ OCR ไว้หน้าเดียว
  if (!ocrTextByPage.size && targetPages.length === 1) {
    const text = postProcessOcrText(String(ocrResult?.text || "").trim());
    if (text) ocrTextByPage.set(targetPages[0], text);
  }
  const ocrPageNumbers = targetPages.filter((page) => ocrTextByPage.has(page));
  if (!ocrPageNumbers.length) return null;

  // ทั้งไฟล์เป็นสแกน: ทำความสะอาดด้วย LLM ครั้งเดียวทั้งก้อน ประหยัดกว่าเรียกรายหน้า
  if (allScanned && ocrLlmCleanup) {
    const merged = ocrPageNumbers.map((page) => ocrTextByPage.get(page)).join("\n\n");
    if (typeof onProgress === "function") {
      onProgress(ocrLlmProvider === "ollama" ? "Cleaning OCR text with Ollama..." : "Cleaning OCR text with LLM...");
    }
    const result = await cleanOcrTextWithLlm(merged);
    const cleanedText = typeof result === "object" && result?.text != null ? result.text : result;
    if (cleanedText && String(cleanedText).trim()) {
      const text = String(cleanedText).trim();
      return {
        text,
        blocks: buildBlocksFromText(text, "OCR"),
        ocrPageNumbers,
        skippedOcrPages: imagePageNumbers.length - targetPages.length,
        ocrLlmCleaned: Boolean(typeof result === "object" && result?.cleaned === true),
      };
    }
  }

  // เอกสารผสม: ทำความสะอาดเฉพาะหน้าที่มาจาก OCR — หน้าที่เป็น text layer เป็นอักขระจริงอยู่แล้ว
  let ocrLlmCleaned = false;
  if (!allScanned && ocrLlmCleanup) {
    const cleanupTargets = ocrPageNumbers.slice(0, OCR_LLM_CLEANUP_MAX_PAGES);
    for (const page of cleanupTargets) {
      try {
        const result = await cleanOcrTextWithLlm(ocrTextByPage.get(page));
        const cleanedText = typeof result === "object" && result?.text != null ? result.text : result;
        if (cleanedText && String(cleanedText).trim()) {
          ocrTextByPage.set(page, String(cleanedText).trim());
          if (typeof result === "object" && result?.cleaned === true) ocrLlmCleaned = true;
        }
      } catch (error) {
        console.warn(`[uploadQueue] LLM cleanup failed for page ${page}:`, error?.message || error);
      }
    }
  }

  const imagePageSet = new Set(imagePageNumbers);
  const parts = [];
  const blocks = [];
  for (let page = 1; page <= total; page += 1) {
    const ocrText = imagePageSet.has(page) ? ocrTextByPage.get(page) : null;
    const chosen = ocrText || (textByPage.get(page) || "").trim();
    if (!chosen) continue;
    parts.push(chosen);
    blocks.push(...buildBlocksFromText(chosen, ocrText ? `Page ${page} (OCR)` : `Page ${page}`));
  }
  if (!parts.length) return null;

  return {
    text: parts.join("\n\n"),
    blocks,
    ocrPageNumbers,
    skippedOcrPages: imagePageNumbers.length - targetPages.length,
    ocrLlmCleaned,
  };
};

/**
 * แสดงโครงสร้างเต็มของ PDF/รูป — ใช้ก่อนอัปโหลด (preview)
 * structureProvider: "typhoon" = OCR ด้วย Typhoon เท่านั้น | "paddle_llm" = Paddle OCR แล้วส่งให้ LLM จัดเรียง/แก้คำ
 * ไม่ส่ง structureProvider = ดึงข้อความจาก PDF: ใช้ pdfplumber ถ้า PDF_PROVIDER=pdfplumber ไม่ฉะนั้น pdfjs (text path). สแกน = ข้อความน้อย → ใช้ Typhoon ที่ caller
 */
export const previewPdfStructure = async ({ buffer, fileName, contentType, structureProvider }) => {
  const name = fileName && typeof fileName === "string" ? fileName : "document.pdf";
  const type = contentType || "application/pdf";
  const isPdf = type.toLowerCase().includes("pdf") || /\.pdf$/i.test(name);
  const isExcel = isExcelFile({ fileName: name, contentType: type });

  if (isExcel) {
    const parsed = extractExcelText({ buffer, fileName: name });
    return {
      name,
      text: parsed.text,
      blocks: parsed.blocks,
      metadata: parsed.metadata,
      ocrLlmCleaned: false,
    };
  }

  if (!isPdf && structureProvider !== "typhoon" && structureProvider !== "paddle_llm") {
    const text = buffer.toString("utf-8");
    const blocks = buildBlocksFromText(text);
    return { name, blocks, ocrLlmCleaned: false };
  }

  if (structureProvider === "typhoon") {
    const body = await runOcrExtract({ buffer, fileName: name, contentType: type, provider: "typhoon" });
    const text = (body?.text || "").trim();
    const blocks = text ? buildBlocksFromText(text, "Typhoon OCR") : [];
    return { name, blocks, ocrLlmCleaned: false };
  }

  if (structureProvider === "paddle_llm") {
    // PDF: ดึงแค่ text จาก PDF อย่างเดียว (ไม่ใช้ Paddle ไม่ใช้ LLM — เร็ว). รูปภาพยังใช้ paddle
    const ocrProvider = isPdf ? "text" : "paddle";
    const body = await runOcrExtract({ buffer, fileName: name, contentType: type, provider: ocrProvider });
    const finalText = (body?.text || "").trim();
    const blocks = finalText ? buildBlocksFromText(finalText, "Text") : [];
    return { name, blocks, ocrLlmCleaned: false };
  }

  if (!isPdf) {
    const text = buffer.toString("utf-8");
    const blocks = buildBlocksFromText(text);
    return { name, blocks, ocrLlmCleaned: false };
  }
  const { text, blocks: rawBlocks } = await extractPdfText(buffer);
  let finalText = text || "";
  let didLlmCleanup = false;

  if (finalText.trim() && ocrLlmCleanup) {
    const llmResult = await cleanOcrTextWithLlm(finalText);
    const cleaned = typeof llmResult === "object" && llmResult?.text != null ? llmResult.text : llmResult;
    didLlmCleanup = Boolean(typeof llmResult === "object" && llmResult?.cleaned === true);
    if (cleaned && String(cleaned).trim()) finalText = cleaned;
  }

  const blocks = finalText.trim()
    ? buildBlocksFromText(finalText.trim(), "Text + LLM")
    : rawBlocks;
  return { name, blocks, ocrLlmCleaned: didLlmCleanup };
};
