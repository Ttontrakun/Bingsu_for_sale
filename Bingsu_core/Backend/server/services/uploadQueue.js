import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { prisma } from "../db.js";
import { getRedisClient, isRedisReady } from "../redis.js";
import {
  MAX_DAILY_UPLOAD_BYTES,
  qdrantCollectionName,
  storeRawFiles,
  uploadQueueMode,
  uploadQueueName,
} from "../config.js";
import { logEvent } from "../lib/logging.js";
import { getDateKey, getOrCreateUsageDaily } from "./usage.js";
import { buildBlocksFromText, ensureSourceFileBlocks } from "./text.js";
import { indexDocumentChunks } from "./vectorDb.js";
import { storeOriginalFile } from "./fileStorage.js";
import { cleanOcrTextWithLlm, postProcessOcrText, structureOcrTextWithLlm } from "./chat.js";
import { extractExcelText, isExcelFile } from "./excel.js";
import {
  ocrAlwaysForPdf,
  ocrLlmCleanup,
  ocrLlmCleanupPerPage,
  ocrLlmProvider,
  ocrLlmStructure,
  pdfProvider,
} from "../config.js";
import { spawn } from "child_process";

const OCR_API_URL = (process.env.OCR_API_URL || "").replace(/\/+$/, "");
const OCR_ENABLED = (process.env.OCR_ENABLED || "true") === "true";
const OCR_LANG = process.env.OCR_LANG || "th";
const OCR_MAX_PAGES = Number(process.env.OCR_MAX_PAGES || 30);
const OCR_DPI = Number(process.env.OCR_DPI || 200);
const OCR_USE_ANGLE_CLS = (process.env.OCR_USE_ANGLE_CLS || "true") === "true";
const OCR_MIN_TEXT_CHARS = Number(process.env.OCR_MIN_TEXT_CHARS || 400);
/** เกณฑ์ต่อหน้า: ถ้าดึงข้อความได้น้อยกว่านี้ถือว่าหน้าเป็น "ภาพ" (สแกน) ใช้ Typhoon เฉพาะหน้านั้น */
const OCR_MIN_TEXT_CHARS_PER_PAGE = Number(process.env.OCR_MIN_TEXT_CHARS_PER_PAGE || 50);
/** Open Typhoon OCR (api.opentyphoon.ai/v1/ocr): ต้องตั้ง TYPHOON_OCR_API_KEY. ตัวเลือก: TYPHOON_OCR_API_URL, TYPHOON_OCR_MODEL, TYPHOON_OCR_TASK_TYPE, TYPHOON_OCR_MAX_TOKENS, TYPHOON_OCR_TEMPERATURE, TYPHOON_OCR_TOP_P, TYPHOON_OCR_REPETITION_PENALTY */
const TYPHOON_OCR_API_URL = (process.env.TYPHOON_OCR_API_URL || "https://api.opentyphoon.ai/v1/ocr").replace(/\/+$/, "");
const TYPHOON_OCR_API_KEY = (process.env.TYPHOON_OCR_API_KEY || "").trim();
const TYPHOON_OCR_MODEL = process.env.TYPHOON_OCR_MODEL || "typhoon-ocr";
const TYPHOON_OCR_TASK_TYPE = process.env.TYPHOON_OCR_TASK_TYPE || "default";
const TYPHOON_OCR_MAX_TOKENS = Number(process.env.TYPHOON_OCR_MAX_TOKENS || 16384);
const TYPHOON_OCR_TEMPERATURE = Number(process.env.TYPHOON_OCR_TEMPERATURE || 0.1);
const TYPHOON_OCR_TOP_P = Number(process.env.TYPHOON_OCR_TOP_P || 0.6);
const TYPHOON_OCR_REPETITION_PENALTY = Number(process.env.TYPHOON_OCR_REPETITION_PENALTY || 1.2);

const uploadRoot = path.join(process.cwd(), ".uploads");
fs.mkdir(uploadRoot, { recursive: true }).catch((error) => {
  console.error("Failed to create upload folder", error);
});

const uploadQueue = [];
let isUploadProcessing = false;

export const useRedisQueue = () => uploadQueueMode === "redis" && isRedisReady();

const sanitizeFileName = (name) => name.replace(/[^\w.\-() ]+/g, "_");

export const getUploadPaths = (uploadId, fileName) => {
  const sessionDir = path.join(uploadRoot, uploadId);
  const partsDir = path.join(sessionDir, "parts");
  const assembledPath = path.join(sessionDir, fileName);
  return { sessionDir, partsDir, assembledPath };
};

export const createUploadBatch = async (userId, displayName) => {
  return prisma.uploadBatch.create({
    data: {
      userId,
      displayName,
      status: "uploading",
      progressMessage: "Waiting for upload...",
    },
  });
};

export const createUploadSession = async (batchId, userId, metadata) => {
  const batch = await prisma.uploadBatch.findFirst({
    where: { id: batchId, userId },
  });
  if (!batch) {
    throw new Error("Upload batch not found");
  }

  const uploadId = crypto.randomUUID();
  const safeName = sanitizeFileName(metadata.name);
  const { sessionDir, partsDir, assembledPath } = getUploadPaths(uploadId, safeName);

  await fs.mkdir(partsDir, { recursive: true }).catch(() => null);

  const session = await prisma.uploadFile.create({
    data: {
      id: uploadId,
      batchId,
      name: safeName,
      size: metadata.size,
      type: metadata.type,
      totalParts: metadata.totalParts,
      assembledPath,
      status: "uploading",
    },
  });

  await prisma.uploadBatch.update({
    where: { id: batchId },
    data: {
      uploadPartsTotal: { increment: metadata.totalParts },
    },
  });

  return { ...session, sessionDir, partsDir };
};

export const assembleUploadParts = async (session, partsDir, assembledPath) => {
  const outputStream = fsSync.createWriteStream(assembledPath);
  for (let partNumber = 1; partNumber <= session.totalParts; partNumber += 1) {
    const partPath = path.join(
      partsDir,
      `part-${String(partNumber).padStart(6, "0")}`,
    );
    const data = await fs.readFile(partPath);
    outputStream.write(data);
  }
  await new Promise((resolve, reject) => {
    outputStream.end();
    outputStream.on("finish", resolve);
    outputStream.on("error", reject);
  });
};

export const enqueueUploadBatch = async (batchId) => {
  if (useRedisQueue()) {
    await getRedisClient().lPush(uploadQueueName, batchId);
    return;
  }
  uploadQueue.push(batchId);
  if (!isUploadProcessing) {
    processUploadQueue();
  }
};

const processUploadQueue = async () => {
  if (useRedisQueue()) return;
  if (isUploadProcessing) return;
  isUploadProcessing = true;

  while (uploadQueue.length > 0) {
    const batchId = uploadQueue.shift();
    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch || batch.status === "processing" || batch.status === "done") continue;
    try {
      await processUploadBatch(batchId);
    } catch (error) {
      await prisma.uploadBatch.update({
        where: { id: batchId },
        data: {
          status: "error",
          error: error instanceof Error ? error.message : "Upload processing failed",
        },
      });
      console.error("Batch processing failed:", error);
      await logEvent({
        level: "error",
        event: "upload.batch.failed",
        actorId: batch?.userId ?? undefined,
        targetType: "upload_batch",
        targetId: batchId,
        outcome: "failed",
        meta: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  isUploadProcessing = false;
};

const getQueueElement = (result) => {
  if (!result) return null;
  if (Array.isArray(result)) return result[1];
  if (typeof result === "object" && result.element) return result.element;
  return null;
};

const startRedisUploadWorker = async () => {
  if (!useRedisQueue()) return;
  console.log("Upload worker listening on Redis queue", uploadQueueName);
  while (true) {
    const result = await getRedisClient().brPop(uploadQueueName, 0);
    const batchId = getQueueElement(result);
    if (!batchId) continue;
    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch || batch.status === "processing" || batch.status === "done") {
      continue;
    }
    try {
      await processUploadBatch(batchId);
    } catch (error) {
      await prisma.uploadBatch.update({
        where: { id: batchId },
        data: {
          status: "error",
          error: error instanceof Error ? error.message : "Upload processing failed",
        },
      });
      console.error("Batch processing failed:", error);
      await logEvent({
        level: "error",
        event: "upload.batch.failed",
        actorId: batch?.userId ?? undefined,
        targetType: "upload_batch",
        targetId: batchId,
        outcome: "failed",
        meta: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }
};

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
    const text = pageMatch ? result.slice(result.indexOf("\n") + 1).trim() : result.trim();
    return { text, pageCount };
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

const copyBinaryData = (data) => {
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

const extractPdfText = async (buffer) => {
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
        const { text, pageCount } = await extractPdfTextWithPlumber(buffer, scriptPath);
        const blocks = text ? buildBlocksFromText(text, "pdfplumber") : [];
        return { text: text || "", blocks, pageCount, engine: "pdfplumber" };
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
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const pageText = await extractPdfPageText(page);
    if (pageText) {
      blocks.push(...buildBlocksFromText(pageText, `Page ${pageNumber}`));
    }
  }
  const text = blocks.map((block) => block.text).join("\n\n");
  return { text, blocks, pageCount: pdf.numPages, engine: "pdfjs" };
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
  const imagePageNumbers = [];
  const textByPage = [];
  for (const { page, text } of pages) {
    const len = String(text || "").replace(/\s+/g, "").trim().length;
    if (len < OCR_MIN_TEXT_CHARS_PER_PAGE) {
      imagePageNumbers.push(page);
    } else {
      textByPage.push({ page, text: (text || "").trim() });
    }
  }
  return { imagePageNumbers, textByPage, pageCount };
};

const shouldRunOcrForPdf = ({ text = "", pageCount = 0 } = {}) => {
  if (!OCR_ENABLED) return false;
  if (!OCR_API_URL && !TYPHOON_OCR_API_URL) return false;
  if (!pageCount) return false;
  if (ocrAlwaysForPdf) return true;
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

/** ล้างผล OCR จาก Typhoon — เอา metadata/code ออก เหลือแค่ข้อความ (ตารางคงโครงสร้างไว้) */
function cleanTyphoonOcrOutput(content) {
  let text = String(content || "").trim();
  text = text.replace(/<figure>[\s\S]*?<\/figure>\s*/gi, "");
  text = text.replace(/```[\w]*\n[\s\S]*?```\s*/g, "");
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
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

  return parseResponse(response);
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
  const isPdfUpload = String(type).toLowerCase().includes("pdf") || /\.pdf$/i.test(String(name));

  // PDF: ลองดึง text layer ก่อน (pdfplumber ถ้ามีสคริปต์ → ไม่เช่นนั้น pdf.js) ถ้าได้ข้อความเพียงพอจะไม่เรียก Typhoon (เอกสารที่พิมพ์/มีเลเยอร์ข้อความ)
  const pdfTryNativeBeforeTyphoon =
    !skipNativePdfProbe &&
    isPdfUpload &&
    (provider === "typhoon" || provider == null) &&
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
  if (isPdfUpload && (provider === "typhoon" || provider == null) && TYPHOON_OCR_API_URL && TYPHOON_OCR_API_KEY) {
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
  if (!isPdfUpload && provider === "typhoon" && TYPHOON_OCR_API_URL && TYPHOON_OCR_API_KEY) {
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
  if (provider === "typhoon" || provider === "paddle" || provider === "text") {
    form.append("provider", provider);
  }

  const timeoutMs = provider === "text" ? 180000 : Number(process.env.OCR_EXTRACT_TIMEOUT_MS || 300000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, { method: "POST", body: form, signal: controller.signal });
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e?.message || String(e);
    if (/fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|bad address|aborted/i.test(msg)) {
      const serviceName = provider === "text" ? "API (ดึง text)" : "OCR (API)";
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
  return body;
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

const processUploadBatch = async (batchId) => {
  const batch = await prisma.uploadBatch.findUnique({
    where: { id: batchId },
    include: { files: true },
  });
  if (!batch) {
    throw new Error("Upload batch not found");
  }

  await prisma.uploadBatch.update({
    where: { id: batchId },
    data: {
      status: "processing",
      progressCurrent: 0,
      progressTotal: 0,
      progressMessage: "Preparing...",
      progressFileName: null,
    },
  });

  const sessions = batch.files;

  const processingPlan = [];
  for (const session of sessions) {
    const buffer = await fs.readFile(session.assembledPath);
    if (session.type === "application/pdf" || /\.pdf$/i.test(session.name)) {
      const pdfData = copyBinaryData(buffer);
      const pdf = await getDocument({ data: pdfData, disableWorker: true }).promise;
      processingPlan.push({ session, buffer, pdf });
    } else {
      processingPlan.push({ session, buffer });
    }
  }

  const totalSteps = sessions.length + 1;
  let completedSteps = 0;
  const setProgressMessage = (message, fileName) => {
    prisma.uploadBatch.update({
      where: { id: batchId },
      data: {
        progressMessage: message,
        progressFileName: fileName ?? null,
      },
    }).catch(() => null);
  };
  const updateProgress = (message, fileName) => {
    completedSteps += 1;
    prisma.uploadBatch.update({
      where: { id: batchId },
      data: {
        progressCurrent: completedSteps,
        progressTotal: totalSteps,
        progressMessage: message,
        progressFileName: fileName ?? null,
      },
    }).catch(() => null);
  };

  const sourceFiles = [];
  const previewByFileName = new Map();
  const rawPreview = batch.previewSourceFiles;
  if (Array.isArray(rawPreview) && rawPreview.length > 0) {
    rawPreview.forEach((f) => {
      const name = f?.name && typeof f.name === "string" ? f.name : "";
      if (name) previewByFileName.set(name, f);
    });
    console.log(`[Upload] Batch has preview for ${previewByFileName.size} file(s) — will skip re-extract`);
  } else {
    console.log("[Upload] No previewSourceFiles — will extract/OCR from PDF");
  }

  for (const plan of processingPlan) {
    const { session, buffer } = plan;
    const isPdf = session.type === "application/pdf" || /\.pdf$/i.test(session.name);
    const storage = storeRawFiles
      ? await storeOriginalFile({
          buffer,
          fileName: session.name,
          contentType: session.type,
          userId: batch.userId,
          documentId: batch.id,
        })
      : null;

    const previewFile = previewByFileName.get(session.name);
    const previewBlocks = Array.isArray(previewFile?.blocks) ? previewFile.blocks : [];

    if (previewBlocks.length > 0) {
      const combinedText = previewBlocks
        .map((b) => (typeof b?.text === "string" ? b.text : ""))
        .filter(Boolean)
        .join("\n\n");
      const previewTextNorm = String(combinedText || "").replace(/\s+/g, "").trim();
      // PDF สแกน: ถ้า preview มีข้อความน้อยมาก ไม่ใช้ preview — ไปดึง + OCR แทน
      if (
        isPdf &&
        previewTextNorm.length < OCR_MIN_TEXT_CHARS &&
        TYPHOON_OCR_API_URL &&
        OCR_ENABLED
      ) {
        console.log(`[Upload] Preview for "${session.name}" has very little text (${previewTextNorm.length} chars) — will extract/OCR instead`);
      } else if (previewTextNorm.length >= OCR_MIN_TEXT_CHARS || !isPdf) {
        const blocks = buildBlocksFromText(combinedText.trim() || " ", "Preview");
        console.log(`[Upload] Using preview for "${session.name}": ${combinedText.length} chars → ${blocks.length} chunk(s)`);
        sourceFiles.push({
          name: session.name,
          size: session.size,
          type: session.type,
          text: combinedText,
          blocks,
          ocrLlmCleaned: false,
          ...(storage ? { storage } : {}),
        });
        updateProgress("ใช้โครงสร้างที่ดูไว้ — แบ่ง chunk...", session.name);
        continue;
      }
    }

    if (isPdf) {
      const pdf = plan.pdf ?? await getDocument({ data: copyBinaryData(buffer), disableWorker: true }).promise;
      let { text, blocks, pageCount } = await extractPdfText(buffer);
      let didOcrLlmCleanup = false;
      const runOcr = shouldRunOcrForPdf({ text, pageCount });
      if (!runOcr && pageCount > 0) {
        const len = String(text || "").replace(/\s+/g, "").trim().length;
        console.log(
          `[Upload] PDF "${session.name}" skip OCR: text=${len} chars, pageCount=${pageCount}, OCR_ENABLED=${OCR_ENABLED}, hasTyphoon=${Boolean(TYPHOON_OCR_API_URL)}`
        );
      }
      if (runOcr) {
        try {
          setProgressMessage("Running Typhoon OCR (PDF สแกน)...", session.name);
          // PDF สแกน: ใช้ Typhoon OCR (runOcrExtract จะลอง Typhoon ก่อนเมื่อเป็น PDF)
          const ocrResult = await runOcrExtract({
            buffer,
            fileName: session.name,
            contentType: session.type || "application/pdf",
            provider: "typhoon",
            skipNativePdfProbe: true,
          });
          const ocrPages = Array.isArray(ocrResult?.pages) ? ocrResult.pages : [];
          let ocrText = String(ocrResult?.text || "").trim();
          ocrText = postProcessOcrText(ocrText);
          if (ocrText && ocrLlmCleanup) {
            setProgressMessage(
              ocrLlmProvider === "ollama" ? "Cleaning OCR text with Ollama..." : "Cleaning OCR text with LLM...",
              session.name,
            );
            const llmResult = await cleanOcrTextWithLlm(ocrText);
            ocrText = typeof llmResult === "object" && llmResult?.text != null ? llmResult.text : llmResult;
            didOcrLlmCleanup = Boolean(typeof llmResult === "object" && llmResult?.cleaned === true);
          }
          if (ocrText && ocrLlmStructure) {
            setProgressMessage(
              ocrLlmProvider === "ollama" ? "Structuring text with Ollama..." : "Structuring text with LLM...",
              session.name,
            );
            ocrText = await structureOcrTextWithLlm(ocrText);
          }
          if (ocrText) {
            text = ocrText;
            // เมื่อใช้ LLM cleanup ได้ข้อความรวมหนึ่งก้อน; มิฉะนั้นใช้ per-page blocks ถ้ามี
            blocks =
              ocrLlmCleanup || !ocrPages.length
                ? buildBlocksFromText(ocrText, "OCR")
                : ocrPages.flatMap((page) =>
                    buildBlocksFromText(String(page?.text || ""), `Page ${page?.page || "?"} (OCR)`),
                  );
          }
        } catch (error) {
          console.warn("OCR failed, continuing with extracted PDF text", error);
        }
      }
      sourceFiles.push({
        name: session.name,
        size: session.size,
        type: session.type,
        text,
        blocks,
        ocrLlmCleaned: didOcrLlmCleanup,
        ...(storage ? { storage } : {}),
      });

      updateProgress("Extracting PDF text...", session.name);
    } else {
      const excelUpload = isExcelFile({ fileName: session.name, contentType: session.type });
      if (excelUpload) {
        const parsed = extractExcelText({ buffer, fileName: session.name });
        sourceFiles.push({
          name: session.name,
          size: session.size,
          type: session.type,
          text: parsed.text,
          blocks: parsed.blocks,
          ocrLlmCleaned: false,
          metadata: parsed.metadata,
          ...(storage ? { storage } : {}),
        });
        updateProgress("Parsing Excel rows...", session.name);
        continue;
      }
      const fileText = buffer.toString("utf-8");
      const blocks = buildBlocksFromText(fileText);
      sourceFiles.push({
        name: session.name,
        size: session.size,
        type: session.type,
        text: fileText,
        blocks,
        ocrLlmCleaned: false,
        ...(storage ? { storage } : {}),
      });
      updateProgress("Preparing text...", session.name);
    }
  }

  const preparedFiles = ensureSourceFileBlocks(sourceFiles);
  const document = await prisma.document.create({
    data: {
      displayName: batch.displayName,
      ragStoreName: qdrantCollectionName,
      sourceFiles: preparedFiles,
      ownerId: batch.userId,
    },
  });

  const setIndexProgress = (batchNum, totalBatches, chunkCount) => {
    const message = totalBatches > 1 && batchNum > 0
      ? `สร้าง embedding และเก็บในฐานข้อมูล... (${batchNum}/${totalBatches} ชุด, ${chunkCount} ชิ้น)`
      : "สร้าง embedding และเก็บในฐานข้อมูล...";
    prisma.uploadBatch.update({
      where: { id: batchId },
      data: { progressMessage: message, progressFileName: null },
    }).catch(() => null);
  };
  setIndexProgress(0, 1, 0);
  await indexDocumentChunks({
    documentId: document.id,
    userId: batch.userId,
    sourceFiles: preparedFiles,
    onProgress: setIndexProgress,
  });

  await prisma.uploadBatch.update({
    where: { id: batchId },
    data: {
      status: "done",
      progressCurrent: totalSteps,
      progressTotal: totalSteps,
      progressMessage: "All set!",
      progressFileName: null,
      documentId: document.id,
    },
  });

  const totalUploadBytes = sessions.reduce((sum, session) => sum + (session.size || 0), 0);
  const usage = await getOrCreateUsageDaily(batch.userId);
  await prisma.usageDaily.update({
    where: { id: usage.id },
    data: { uploadBytes: usage.uploadBytes + totalUploadBytes },
  });

  await prisma.uploadFile.updateMany({
    where: { batchId },
    data: { status: "complete" },
  });

  for (const session of sessions) {
    const { sessionDir } = getUploadPaths(session.id, session.name);
    fs.rm(sessionDir, { recursive: true, force: true }).catch(() => null);
  }
};

export const startUploadWorker = async () => {
  await hydrateUploadQueue();
  if (useRedisQueue()) {
    await startRedisUploadWorker();
  } else {
    processUploadQueue();
  }
};

export const hydrateUploadQueue = async () => {
  try {
    const pending = await prisma.uploadBatch.findMany({
      where: { status: { in: ["processing"] } },
      select: { id: true },
    });
    for (const batch of pending) {
      await enqueueUploadBatch(batch.id);
    }
  } catch (error) {
    console.error("Failed to hydrate upload queue", error);
  }
};

export const deleteBotWithCleanup = async (botId) => {
  await prisma.botDocument.deleteMany({ where: { botId } });
  await prisma.conversation.updateMany({
    where: { botId },
    data: { botId: null },
  });
  await prisma.bot.delete({ where: { id: botId } });
};

export const canUploadMoreToday = async (userId, additionalBytes) => {
  const dateKey = getDateKey();
  const usage = await prisma.usageDaily.findUnique({
    where: { userId_dateKey: { userId, dateKey } },
  });
  if (!usage) return true;
  return usage.uploadBytes + additionalBytes <= MAX_DAILY_UPLOAD_BYTES;
};
