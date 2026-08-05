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
import { structureOcrTextWithLlm } from "./chat.js";
import { extractExcelText, isExcelFile } from "./excel.js";
import { ocrLlmProvider, ocrLlmStructure } from "../config.js";
import {
  OCR_ENABLED,
  OCR_MIN_TEXT_CHARS,
  TYPHOON_OCR_API_URL,
  copyBinaryData,
  extractPdfText,
  extractPdfTextHybrid,
  shouldRunOcrForPdf,
} from "./pdfExtract.js";
// คงชื่อ export เดิมไว้ให้ route/สคริปต์ที่ import จาก uploadQueue.js ใช้ได้ต่อ
export { runOcrExtract, previewPdfStructure, getPdfPageDetection } from "./pdfExtract.js";


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
        meta: {
          displayName: batch?.displayName || null,
          error: error instanceof Error ? error.message : String(error),
        },
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
        meta: {
          displayName: batch?.displayName || null,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
};

// โค้ดดึงข้อความ PDF + OCR ถูกย้ายไป services/pdfExtract.js (ดู import/re-export ด้านบน)

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
      let { text, blocks, pageCount, pages: pdfTextPages } = await extractPdfText(buffer);
      let didOcrLlmCleanup = false;
      const runOcr = shouldRunOcrForPdf({ text, pageCount, pages: pdfTextPages });
      if (!runOcr && pageCount > 0) {
        const len = String(text || "").replace(/\s+/g, "").trim().length;
        console.log(
          `[Upload] PDF "${session.name}" skip OCR: text=${len} chars, pageCount=${pageCount}, OCR_ENABLED=${OCR_ENABLED}, hasTyphoon=${Boolean(TYPHOON_OCR_API_URL)}`
        );
      }
      if (runOcr) {
        try {
          // ผสมรายหน้า: หน้าที่อ่าน text layer ได้ใช้อักขระจริง, หน้าที่เป็นภาพจึงส่งไป OCR
          const hybrid = await extractPdfTextHybrid({
            buffer,
            fileName: session.name,
            contentType: session.type || "application/pdf",
            pages: pdfTextPages,
            pageCount,
            onProgress: (message) => setProgressMessage(message, session.name),
          });
          if (hybrid) {
            let hybridText = hybrid.text;
            if (hybridText && ocrLlmStructure) {
              setProgressMessage(
                ocrLlmProvider === "ollama" ? "Structuring text with Ollama..." : "Structuring text with LLM...",
                session.name,
              );
              hybridText = await structureOcrTextWithLlm(hybridText);
            }
            if (hybridText) {
              text = hybridText;
              blocks = hybridText === hybrid.text ? hybrid.blocks : buildBlocksFromText(hybridText, "OCR");
              didOcrLlmCleanup = hybrid.ocrLlmCleaned;
              console.log(
                `[Upload] PDF "${session.name}" hybrid: OCR ${hybrid.ocrPageNumbers.length}/${pageCount} page(s)` +
                  (hybrid.skippedOcrPages > 0 ? `, เกิน OCR_MAX_PAGES ${hybrid.skippedOcrPages} หน้า` : ""),
              );
            }
          } else {
            console.log(`[Upload] PDF "${session.name}" ทุกหน้ามี text layer — ไม่ต้อง OCR`);
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
