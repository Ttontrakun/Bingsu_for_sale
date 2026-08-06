/**
 * ตัวช่วยฝั่ง retrieval: เลือกเอกสารเป้าหมาย, เขียนคำถาม follow-up ให้ standalone,
 * และค้น grounding chunks แบบผสานประวัติคำถามก่อนหน้า
 * ย้ายมาจาก routes/conversations.js (refactor แยกไฟล์ ไม่เปลี่ยนพฤติกรรม)
 */
import { prisma } from "../../db.js";
import { callOpenAiGateway } from "../chat.js";
import { retrieveGroundingChunks } from "../rag.js";
import {
  normalizeText,
  isAuthorityDecisionQuery,
  isAuthorityDetailFollowUpQuery,
  isLikelyFollowUp,
  hasMultipleQuestions,
  extractEvidenceTokens,
  hasSufficientGroundingEvidence,
  buildAuthorityRetrievalQuery,
} from "./queryClassifiers.js";

export const isAuthoritySourceDocument = (doc) => {
  const display = normalizeText(doc?.displayName || "");
  const source = normalizeText(JSON.stringify(doc?.sourceFiles || ""));
  return /(ตารางสรุป_คู่มือการใช้งานระเบียบ_คำสั่งประกาศ|คู่มือการใช้ระเบียบ|super\s*product\s*manager|product\s*manager|โครงสร้างใหม่)/.test(display)
    || /(ตารางสรุป|super product manager|product manager|โครงสร้างใหม่)/.test(source);
};

export const resolveAuthorityDocIds = (docs = [], fallbackDocIds = []) => {
  const scoped = (docs || [])
    .filter((doc) => doc?.id && isAuthoritySourceDocument(doc))
    .map((doc) => String(doc.id));
  return scoped.length > 0 ? Array.from(new Set(scoped)) : fallbackDocIds;
};

export const resolveRetrievalTargets = (message, rawContextDocs = [], defaultDocumentIds = []) => {
  // คำถามหลายข้อมักครอบหลายหัวข้อ/หลายเอกสาร — ห้ามหด scope เป็น "เฉพาะเอกสารอำนาจอนุมัติ"
  // เพราะบางข้ออาจอยู่คนละเอกสาร (เช่น ข้อเรื่องเสาโทรคมนาคมปนกับข้อเรื่องอำนาจอนุมัติ) → ใช้ทุกเอกสารในชุด Knowledge
  if (hasMultipleQuestions(message)) {
    return { primaryDocumentIds: defaultDocumentIds, secondaryDocumentIds: null };
  }
  const primaryDocumentIds = isAuthorityDecisionQuery(message)
    ? resolveAuthorityDocIds(rawContextDocs, defaultDocumentIds)
    : defaultDocumentIds;
  const canFallbackToDefault =
    isAuthorityDecisionQuery(message)
    && primaryDocumentIds.length > 0
    && primaryDocumentIds.length < defaultDocumentIds.length;
  return {
    primaryDocumentIds,
    secondaryDocumentIds: canFallbackToDefault ? defaultDocumentIds : null,
  };
};

/**
 * แปลงคำถามต่อเนื่อง (follow-up) ให้เป็นคำถามสมบูรณ์แบบ standalone โดยอาศัยประวัติสนทนา
 * เพื่อให้ embed/retrieval ดึง chunk ได้ตรง (แก้ปัญหาถามต่อเนื่องแล้วระบบดึงข้อมูลผิด)
 * ถ้าไม่ใช่ follow-up หรือไม่มีประวัติ/เขียนใหม่ไม่สำเร็จ → คืนค่าข้อความเดิม
 */
export const buildStandaloneQuery = async (message, conversationId) => {
  try {
    // ปิด LLM rewrite โดยดีฟอลต์เพื่อความเร็ว (ตั้ง RAG_STANDALONE_REWRITE=1 เพื่อเปิด)
    // คำถามต่อเนื่องยังค้นเจอได้จากกลไก history-merge ใน resolveGroundingChunks ที่ไม่ต้องเรียก LLM
    if (process.env.RAG_STANDALONE_REWRITE !== "1") return message;
    if (!isLikelyFollowUp(message)) return message;
    const recent = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { role: true, content: true },
    });
    if (!recent.length) return message;
    const historyText = recent
      .reverse()
      .map((r) => `${r.role === "model" ? "ผู้ช่วย" : "ผู้ใช้"}: ${String(r.content ?? "").trim()}`)
      .filter((line) => line.length > 6)
      .join("\n");
    if (!historyText) return message;
    const resp = await callOpenAiGateway([
      {
        role: "system",
        content:
          "เขียน 'คำถามล่าสุด' ของผู้ใช้ใหม่ให้เป็นคำถามสมบูรณ์แบบ standalone โดยรวมบริบทจากประวัติสนทนา " +
          "(แทนคำสรรพนาม/คำอ้างอิง เช่น 'อันนี้' 'แบบนั้น' 'อันที่สอง' ด้วยสิ่งที่อ้างถึงจริง). " +
          "ตอบกลับเฉพาะข้อความคำถามที่เขียนใหม่บรรทัดเดียว ไม่มีคำอธิบาย ไม่มีเครื่องหมายคำพูด. " +
          "ถ้าคำถามสมบูรณ์ในตัวอยู่แล้ว ให้ส่งกลับข้อความเดิม.",
      },
      { role: "user", content: `ประวัติ:\n${historyText}\n\nคำถามล่าสุด: ${message}\n\nคำถาม standalone:` },
    ]);
    const rewritten = resp?.choices?.[0]?.message?.content?.trim();
    if (rewritten && rewritten.length > 0 && rewritten.length <= 400) {
      if (process.env.DEBUG_RAG === "1") {
        console.log(`[rag] standalone rewrite: "${message}" -> "${rewritten}"`);
      }
      return rewritten;
    }
  } catch (error) {
    console.warn("buildStandaloneQuery failed, using original message", error?.message || error);
  }
  return message;
};

/**
 * ดึง "คำถามล่าสุดของผู้ใช้" ก่อนหน้านี้ในห้องสนทนา เพื่อนำมาเสริมตอนค้น embedding
 * (ช่วงนี้ข้อความปัจจุบันยังไม่ถูกบันทึก จึง row ล่าสุด = คำถามก่อนหน้า)
 * ข้าม prompt ที่ระบบสร้างจากปุ่ม follow-up เพื่อให้ได้คำถามหลักจริงของผู้ใช้
 */
export const getPreviousUserQuestionForRetrieval = async (conversationId, currentMessage) => {
  try {
    if (!conversationId) return "";
    const rows = await prisma.message.findMany({
      where: { conversationId, role: "user" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { content: true },
    });
    const current = normalizeText(currentMessage);
    let fallback = "";
    let firstNonGenerated = "";
    for (const row of rows) {
      const text = String(row?.content ?? "").trim();
      if (text.length < 6) continue;
      if (normalizeText(text) === current) continue;
      if (!fallback) fallback = text;
      // ข้ามคำถามที่ระบบสร้างจากปุ่ม follow-up เพื่อให้ได้คำถามหลักจริง
      const m = normalizeText(text);
      const looksGenerated = /^จากคำตอบก่อนหน้า/.test(m) || isAuthorityDetailFollowUpQuery(text);
      if (looksGenerated) continue;
      if (!firstNonGenerated) firstNonGenerated = text;
      // ข้ามคำถามที่เป็น follow-up สั้นๆ ในตัวมันเอง (เช่น "ถ้า 70 วันได้มั้ย", "50 วันล่ะ")
      // เพื่อหา "คำถามหลัก" ที่มี keyword จริงไปเสริม retrieval (กันการดึง chunk ผิดเรื่อง)
      if (isLikelyFollowUp(text)) continue;
      if (extractEvidenceTokens(text).length >= 2) return text;
    }
    return firstNonGenerated || fallback;
  } catch (error) {
    console.warn("getPreviousUserQuestionForRetrieval failed", error?.message || error);
    return "";
  }
};

/**
 * ค้น grounding chunks โดยอิง "ทั้งประวัติคำถามก่อนหน้า + embedding"
 * ขั้นตอน: primary docs → secondary docs → ถ้ายังไม่พอ ให้รวมคำถามก่อนหน้าแล้วค้นซ้ำ
 * แก้ปัญหา follow-up ที่ข้อความสั้น/ไม่มี keyword จน embedding ค้นไม่เจอ แล้วระบบตอบว่า "ไม่พบข้อมูล"
 * คืนค่า { groundingChunks, retrievalDocumentIds, usedHistory }
 */
export const resolveGroundingChunks = async ({
  message,
  conversationId,
  retrievalQuery,
  primaryDocumentIds,
  secondaryDocumentIds,
  fast = false,
}) => {
  // คำถามยืนยันบทบาท → ค้นด้วยรูป "ใครอนุมัติ..." ให้เจอตารางอำนาจเหมือนถามว่าใคร
  const authorityQuery = buildAuthorityRetrievalQuery(message);
  const effectiveQuery = authorityQuery && authorityQuery !== message
    ? `${authorityQuery}\n${retrievalQuery}`
    : retrievalQuery;

  let retrievalDocumentIds = primaryDocumentIds;
  let groundingChunks = await retrieveGroundingChunks(retrievalDocumentIds, effectiveQuery, { fast });
  if (
    secondaryDocumentIds
    && (groundingChunks.length === 0 || !hasSufficientGroundingEvidence(message, groundingChunks))
  ) {
    retrievalDocumentIds = secondaryDocumentIds;
    groundingChunks = await retrieveGroundingChunks(retrievalDocumentIds, effectiveQuery, { fast });
  }

  const insufficient =
    groundingChunks.length === 0 || !hasSufficientGroundingEvidence(message, groundingChunks);
  if (!insufficient) {
    return { groundingChunks, retrievalDocumentIds, usedHistory: false };
  }

  const prevQuestion = await getPreviousUserQuestionForRetrieval(conversationId, message);
  if (!prevQuestion) {
    return { groundingChunks, retrievalDocumentIds, usedHistory: false };
  }

  // รวมคำถามก่อนหน้าเข้ากับคำถามปัจจุบัน เพื่อให้ embedding มี keyword พอจะค้นเจอ
  const mergedQuery = `${prevQuestion}\n${effectiveQuery}`.trim();
  if (process.env.DEBUG_RAG === "1") {
    console.log(
      `[rag] history-merge: msg="${message}" | retrievalQuery="${retrievalQuery}" | prevQuestion="${prevQuestion}" | merged="${mergedQuery.replace(/\n/g, " | ")}"`,
    );
  }
  const candidateIdSets = [primaryDocumentIds, secondaryDocumentIds].filter(Boolean);
  for (const ids of candidateIdSets) {
    const mergedChunks = await retrieveGroundingChunks(ids, mergedQuery, { fast });
    if (mergedChunks.length === 0) continue;
    // ประเมินหลักฐานด้วย mergedQuery (คำถามปัจจุบันเดี่ยวๆ มักไม่มี keyword)
    if (hasSufficientGroundingEvidence(mergedQuery, mergedChunks)) {
      if (process.env.DEBUG_RAG === "1") {
        const preview = String(
          mergedChunks[0]?.retrievedContext?.text ?? mergedChunks[0]?.payload?.text ?? "",
        ).slice(0, 120);
        console.log(`[rag] history-merge matched ${mergedChunks.length} chunk(s). first: "${preview}"`);
      }
      return { groundingChunks: mergedChunks, retrievalDocumentIds: ids, usedHistory: true };
    }
    if (mergedChunks.length > groundingChunks.length) {
      groundingChunks = mergedChunks;
      retrievalDocumentIds = ids;
    }
  }
  return { groundingChunks, retrievalDocumentIds, usedHistory: groundingChunks.length > 0 };
};
