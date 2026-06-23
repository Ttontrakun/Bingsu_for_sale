import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  CHAT_MAX_TOKENS,
  CHAT_TEMPERATURE,
  CHAT_TIMEOUT_MS,
  gatewayBaseUrl,
  openaiDeploymentRetryAttempts,
  openaiDeploymentRetryBaseDelayMs,
  openaiFallbackBaseUrl,
  openaiFallbackKey,
  openaiFallbackModel,
  openaiKey,
  openaiModel,
  ocrLlmApiKey,
  ocrLlmBaseUrl,
  ocrLlmModel,
  ocrLlmProvider,
  ollamaBaseUrl,
  ollamaOcrModel,
  strictPrivacyMode,
} from "../config.js";
import { Agent } from "undici";
import { redactSensitiveText } from "../lib/privacy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** โหลดรายการคำผิด→คำถูกจาก server/ocr-word-fixes.json (ใส่เป็นข้อความ literal ไม่ต้องใช้ regex) แก้ไฟล์แล้ว request ถัดไปใช้รายการล่าสุด */
function loadOcrWordFixes() {
  const p = path.join(__dirname, "..", "ocr-word-fixes.json");
  try {
    if (fs.existsSync(p)) {
      const arr = JSON.parse(fs.readFileSync(p, "utf8"));
      return Array.isArray(arr) ? arr : [];
    }
  } catch {}
  return [];
}

const gatewayConnectTimeoutMs = Number(process.env.GATEWAY_CONNECT_TIMEOUT_MS || CHAT_TIMEOUT_MS || 30000);
const gatewayDispatcher = new Agent({
  connectTimeout: Number.isFinite(gatewayConnectTimeoutMs) ? gatewayConnectTimeoutMs : 30000,
});

const decodeHtmlEntities = (input) =>
  String(input || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

const cleanHtmlCellText = (html) =>
  decodeHtmlEntities(
    String(html || "")
      .replace(/<br\s*\/?>/gi, " / ")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

const parseSpanAttr = (attrs, name) => {
  const m = String(attrs || "").match(new RegExp(`${name}\\s*=\\s*["']?(\\d+)["']?`, "i"));
  const n = Number(m?.[1] || 1);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

const tableHtmlToMarkdown = (tableHtml) => {
  const rowsRaw = [];
  const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(String(tableHtml || ""))) !== null) {
    rowsRaw.push(trMatch[1]);
  }
  if (rowsRaw.length === 0) return "";

  const grid = [];
  const carry = []; // carry[col] = { text, remainingRows }

  for (const rowHtml of rowsRaw) {
    const row = [];
    let col = 0;

    const fillCarry = () => {
      while (carry[col] && carry[col].remainingRows > 0) {
        row[col] = carry[col].text;
        carry[col].remainingRows -= 1;
        if (carry[col].remainingRows <= 0) carry[col] = null;
        col += 1;
      }
    };

    fillCarry();
    // ใช้ parser แบบ tolerant: OCR บางเจ้า (เช่นจาก PDF scan) มักให้ HTML table ที่ปิดแท็กไม่ครบ
    // จึงจับเฉพาะ "จุดเริ่ม cell" แล้วตัดข้อความถึง cell ถัดไป/จบแถว แทนการบังคับต้องมี </td></th> ที่สมบูรณ์
    const cells = [];
    const cellStartRegex = /<(td|th)\b([^>]*)>/gi;
    let cellStartMatch;
    while ((cellStartMatch = cellStartRegex.exec(rowHtml)) !== null) {
      cells.push({
        tag: cellStartMatch[1],
        attrs: cellStartMatch[2] || "",
        start: cellStartMatch.index,
        contentStart: cellStartMatch.index + cellStartMatch[0].length,
      });
    }
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
      fillCarry();
      const current = cells[cellIndex];
      const next = cells[cellIndex + 1];
      const rawCellHtml = rowHtml.slice(current.contentStart, next ? next.start : rowHtml.length);
      const cellHtml = rawCellHtml.replace(/<\/\s*(td|th)\s*>/gi, " ");
      const attrs = current.attrs || "";
      const text = cleanHtmlCellText(cellHtml);
      const colspan = parseSpanAttr(attrs, "colspan");
      const rowspan = parseSpanAttr(attrs, "rowspan");

      for (let i = 0; i < colspan; i += 1) {
        const targetCol = col + i;
        row[targetCol] = i === 0 ? text : "";
        if (rowspan > 1) {
          carry[targetCol] = { text: i === 0 ? text : "", remainingRows: rowspan - 1 };
        }
      }
      col += colspan;
    }
    fillCarry();
    grid.push(row);
  }

  const width = Math.max(0, ...grid.map((r) => r.length));
  if (width === 0) return "";
  const normalizeApprovalMarker = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    // OCR ตารางอนุมัติมักคืนเป็นเครื่องหมาย V/✓/✔ ให้แปลงเป็นข้อความอ่านง่าย
    if (/^(v|✓|✔|✅)$/i.test(raw)) return "อนุมัติ";
    return raw;
  };
  const normalized = grid.map((r) =>
    Array.from({ length: width }, (_, i) => normalizeApprovalMarker(r[i])),
  );
  const header = normalized[0];
  const body = normalized.slice(1);
  const esc = (v) => String(v || "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
  const headerLine = `| ${header.map(esc).join(" | ")} |`;
  const sepLine = `| ${Array.from({ length: width }, () => "---").join(" | ")} |`;
  const bodyLines = body.map((r) => `| ${r.map(esc).join(" | ")} |`);
  return [headerLine, sepLine, ...bodyLines].join("\n");
};

const normalizeOcrHtmlTables = (text) => {
  const source = String(text || "");
  if (!/<table\b/i.test(source)) return source;
  return source.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (tableBlock) => {
    const markdown = tableHtmlToMarkdown(tableBlock);
    return markdown ? `\n${markdown}\n` : "\n";
  });
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sanitizeTextForProvider = (text) => (strictPrivacyMode ? redactSensitiveText(text) : text);
const sanitizeMessagesForProvider = (messages = []) =>
  Array.isArray(messages)
    ? messages.map((message) => ({
        ...message,
        content:
          typeof message?.content === "string"
            ? sanitizeTextForProvider(message.content)
            : message?.content,
      }))
    : messages;
const isDeploymentUnavailable429 = (status, errorText) =>
  status === 429 && /No deployments available|cooldown_list|selected model/i.test(String(errorText || ""));

const buildChatTargets = (modelOverride) => {
  const primaryModel = modelOverride || openaiModel;
  const targets = [{ baseUrl: gatewayBaseUrl, apiKey: openaiKey, model: primaryModel, label: "primary" }];
  if (!openaiFallbackModel) return targets;

  const duplicateTarget =
    openaiFallbackBaseUrl === gatewayBaseUrl
    && openaiFallbackKey === openaiKey
    && openaiFallbackModel === primaryModel;
  if (!duplicateTarget) {
    targets.push({
      baseUrl: openaiFallbackBaseUrl,
      apiKey: openaiFallbackKey,
      model: openaiFallbackModel,
      label: "fallback",
    });
  }
  return targets.filter((target) => target.baseUrl && target.apiKey);
};

const requestGatewayWithFallback = async ({ messages, stream, signal, modelOverride }) => {
  const providerMessages = sanitizeMessagesForProvider(messages);
  const targets = buildChatTargets(modelOverride);
  if (targets.length === 0) {
    throw new Error("Configure OPENAI_API_KEY (or gateway key) in .env.local for chat.");
  }

  let lastError = null;
  const retries = Math.max(0, openaiDeploymentRetryAttempts);

  for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
    const target = targets[targetIndex];
    const hasAnotherTarget = targetIndex < targets.length - 1;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(`${target.baseUrl}/chat/completions`, {
          method: "POST",
          dispatcher: gatewayDispatcher,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${target.apiKey}`,
          },
          body: JSON.stringify({
            model: target.model,
            messages: providerMessages,
            temperature: CHAT_TEMPERATURE,
            max_tokens: CHAT_MAX_TOKENS,
            ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
          }),
          signal,
        });

        if (response.ok) {
          if (targetIndex > 0) {
            console.warn(`[chat] using fallback LLM (${target.model} @ ${target.baseUrl}) after primary failed`);
          }
          return response;
        }

        const errorText = await response.text();
        lastError = new Error(errorText || response.statusText);
        const unavailable = isDeploymentUnavailable429(response.status, errorText);

        if (unavailable && attempt < retries) {
          const baseDelay = Math.max(500, openaiDeploymentRetryBaseDelayMs);
          const jitter = Math.floor(Math.random() * 400);
          const waitMs = baseDelay * (2 ** attempt) + jitter;
          await sleep(waitMs);
          continue;
        }

        if (hasAnotherTarget) break;
        throw lastError;
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        lastError = error instanceof Error ? error : new Error(String(error));
        if (hasAnotherTarget) break;
        throw lastError;
      }
    }
  }

  throw lastError || new Error("Chat request failed");
};

export const callOpenAiGateway = async (messages, modelOverride) => {
  if (!openaiKey && !openaiFallbackKey) {
    throw new Error("Configure OPENAI_API_KEY (or gateway key) in .env.local for chat.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  let response;
  try {
    response = await requestGatewayWithFallback({
      messages,
      stream: false,
      signal: controller.signal,
      modelOverride,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Chat request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || response.statusText);
  }

  return response.json();
};

/** เรียก gateway แบบ streaming — คืนค่า ReadableStream ของ response body (สำหรับ SSE) */
export const callOpenAiGatewayStream = async (messages, modelOverride) => {
  if (!openaiKey && !openaiFallbackKey) {
    throw new Error("Configure OPENAI_API_KEY (or gateway key) in .env.local for chat.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  let response;
  try {
    response = await requestGatewayWithFallback({
      messages,
      stream: true,
      signal: controller.signal,
      modelOverride,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Chat request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || response.statusText);
  }

  return response.body;
};

/** เรียก Ollama (localhost) สำหรับข้อความ OCR — ไม่ส่งข้อมูลออก เครื่อง รันในเครื่องเท่านั้น */
async function callOllamaChat(systemPrompt, userContent, signal) {
  const url = `${ollamaBaseUrl}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaOcrModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 16000,
    }),
    signal,
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

/**
 * แก้ข้อความจาก OCR ด้วยกฎ (รันทุกครั้ง ไม่ต้องพึ่ง LLM) — คำแบ่งผิด ช่องว่างเกิน ตัวเลขผสม
 */
export function postProcessOcrText(text) {
  if (!text || typeof text !== "string") return text;
  let s = normalizeOcrHtmlTables(text);
  // กรณี OCR คืนเป็น Markdown/plain table แล้ว (ไม่ใช่ HTML table ตรงๆ)
  // ให้แปลง marker ในช่องตาราง เช่น V/✓/✔/✅ -> "อนุมัติ"
  s = s
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return line;
      const cells = line.split("|").map((cell) => {
        const raw = String(cell || "").trim();
        if (/^(v|✓|✔|✅)$/i.test(raw)) return " อนุมัติ ";
        return cell;
      });
      return cells.join("|");
    })
    .join("\n");
  // เดาคำอัตโนมัติ: รวมคำไทยที่ OCR ตัดวรรคผิดกลางคำ (ทำแบบ conservative เพื่อลด false positive)
  const THAI_WORD_RE = /[ก-๙]+/g;
  const THAI_STOPWORDS = new Set([
    "และ", "หรือ", "ใน", "ของ", "ที่", "กับ", "ให้", "จาก", "โดย", "เป็น", "มี", "ไม่", "ได้", "ไป", "มา", "คือ",
    "แล้ว", "กว่า", "เพื่อ", "เมื่อ", "หาก", "แต่", "ก็", "ยัง", "จะ", "ตาม", "ต่อ", "ใน", "บน", "ใต้", "ระหว่าง",
  ]);

  const autoMergeBrokenThaiWords = (input) => {
    if (!input) return input;
    return input
      .split("\n")
      .map((line) => {
        let out = line;
        // กรณี "บทน ำ" หรือ "น า" → รวมคำเมื่อด้านขวาสั้นมาก/เป็นตัวสะกดลอย
        out = out.replace(/([ก-๙]{2,})\s+([ำัิีึืุูเแโใไะาำ]{1,2}|[ก-๙]{1,2})\b/g, (m, left, right) => {
          if (THAI_STOPWORDS.has(right)) return m;
          return `${left}${right}`;
        });
        // กรณี "วทิ ยาศาสตร์" หรือ "การ งาน" → รวมเมื่อ token ซ้ายสั้นและ token ขวายาวพอ
        out = out.replace(/([ก-๙]{2,4})\s+([ก-๙]{4,})/g, (m, left, right) => {
          if (THAI_STOPWORDS.has(left) || THAI_STOPWORDS.has(right)) return m;
          return `${left}${right}`;
        });
        return out;
      })
      .join("\n");
  };

  s = autoMergeBrokenThaiWords(s);
  // คำที่ OCR แบ่งผิด / สระ ำ อ่านผิดเป็น า — รวมกลับและแก้สระ
  const wordFixes = [
    [/บุ\s+ญ\b/g, "บุญ"],
    [/ส\s+ระบุรี/g, "สระบุรี"],
    [/องค์กา\s*ร\s+/g, "องค์การ "],
    [/องค\s*์?\s*การ/g, "องค์การ"],
    [/ประจ\s*ำ/g, "ประจำ"],
    [/สมัย\s+สามัญ/g, "สมัยสามัญ"],
    [/การ\s+งาน/g, "การงาน"],
    [/ข\s+้อ\s*มูล/g, "ข้อมูล"],
    [/ข้อ\s+ความ/g, "ข้อความ"],
    [/ระ\s+บบ/g, "ระบบ"],
    [/การ\s+ใช้/g, "การใช้"],
    [/ดัง\s+นี้/g, "ดังนี้"],
    [/ด้วย\s+กัน/g, "ด้วยกัน"],
    [/ที่\s+อยู่/g, "ที่อยู่"],
    [/ผู้\s+ใช้/g, "ผู้ใช้"],
    [/สิ่ง\s+ที่/g, "สิ่งที่"],
    [/เท\s+่านั้น/g, "เท่านั้น"],
    [/อาจ\s+จะ/g, "อาจจะ"],
    [/อยู่\s+ที่/g, "อยู่ที่"],
    [/และ\s+ยัง/g, "และยัง"],
    // สำนัก / ความสำคัญ / ปัญหา — ช่องว่างกลางคำ + OCR ใส่ ำ ผิดเป็น า
    [/ส\s*านัก/g, "สำนัก"],
    [/ส\s*ำนัก/g, "สำนัก"],
    [/ส\s*ำคัญ/g, "สำคัญ"],
    [/ท\s*วาม/g, "ความ"],
    [/ควำม/g, "ความ"],
    [/เป็นมำ\b/g, "เป็นมา"],
    [/ปัญหำ\b/g, "ปัญหา"],
    [/ควำมส\s*ำคัญ/g, "ความสำคัญ"],
    [/ความเป็นมำ/g, "ความเป็นมา"],
    // มหาวิทยาลัย / โดย / ดำเนินงาน — ช่องว่างกลางคำ
    [/มหาวิท\s*ยาลัย/g, "มหาวิทยาลัย"],
    [/โ\s*ดย\b/g, "โดย"],
    [/ด\s*าเนินงาน/g, "ดำเนินงาน"],
    [/ด\s*ำเนินงาน/g, "ดำเนินงาน"],
    // บริการ / สารสนเทศ / บรรณานุกรม — ำ ผิดเป็น า ในคำเหล่านี้
    [/บริกำร/g, "บริการ"],
    [/วิทยบริกำร/g, "วิทยบริการ"],
    [/สำรสนเทศ/g, "สารสนเทศ"],
    [/บรรณำนุกรม/g, "บรรณานุกรม"],
    // คำเฉพาะที่ผู้ใช้แจ้งเพิ่มเติม
    [/วทิ\s*ยาศาสตร์โลก/g, "วิทยาศาสตร์โลก"],
    [/บทน\s*[ำา]/g, "บทนำ"],
    [/ช้ก๊าซออกซิเจน/g, "ชั้นก๊าซออกซิเจน"],
    [/ธรณีภำค/g, "ธรณีภาค"],
    [/เรอื่\s*ง/g, "เรื่อง"],
    [/เรอื่ง/g, "เรื่อง"],
    [/เรอื\s*ง/g, "เรื่อง"],
  ];
  for (const [re, replacement] of wordFixes) s = s.replace(re, replacement);
  // รายการเพิ่มจากไฟล์ server/ocr-word-fixes.json (คำผิด → คำถูก แบบ literal)
  for (const pair of loadOcrWordFixes()) {
    if (Array.isArray(pair) && pair.length >= 2 && typeof pair[0] === "string" && typeof pair[1] === "string") {
      s = s.split(pair[0]).join(pair[1]);
    }
  }
  // ตัวเลขที่มีช่องว่างคั่น เช่น 25 61 → 2561 (ปี พ.ศ.)
  s = s.replace(/\b(\d{2})\s+(\d{2})\b/g, "$1$2");
  // ช่องว่างเกิน (space, tab, non-breaking space ฯลฯ) → 1 ตัว
  s = s.replace(/[ \t\u00A0]{2,}/g, " ");
  // ตัวเลขผสม ไทย+อารบิก → อารบิก (ใช้ Unicode escape เพื่อไม่ให้ Node ผิดพลาด)
  const thaiToArab = { "\u0E50": "0", "\u0E51": "1", "\u0E52": "2", "\u0E53": "3", "\u0E54": "4", "\u0E55": "5", "\u0E56": "6", "\u0E57": "7", "\u0E58": "8", "\u0E59": "9" };
  s = s.replace(/([\u0E50-\u0E59])(\d{2,})/g, (_, thai, rest) => (thaiToArab[thai] || thai) + rest);
  s = s.replace(/(\d)([\u0E50-\u0E59]+)/g, (_, arab, thaiRest) => arab + [...thaiRest].map((c) => thaiToArab[c] || c).join(""));
  // ตัดสัญลักษณ์ตัดข้อความแบบ *****
  s = s.replace(/\s*\*{3,}\s*/g, " ");
  // หลังแทนคำแล้ว ลองรวมคำไทยแตกซ้ำอีกรอบ
  s = autoMergeBrokenThaiWords(s);
  // ล้างช่องว่างซ้ำระหว่างคำที่ไม่ใช่บรรทัดใหม่
  s = s.replace(/[ \t]{2,}/g, " ");
  // normalize ช่องว่างก่อน/หลังบรรทัด
  s = s
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
  return s.trim();
}

/**
 * ส่งข้อความจาก OCR ไปให้ LLM จัดรูปแบบและแก้คำผิด (ใช้กับ PaddleOCR ก่อน embed).
 * มี post-process ด้วยกฎรันก่อนเสมอ จึงได้อย่างน้อยคำที่แบ่งผิด/ช่องว่าง/ตัวเลขแก้แล้วแม้ LLM ไม่รัน
 * คืนค่า { text, cleaned }: text = ข้อความที่ใช้ได้, cleaned = true เมื่อ LLM ประมวลผลสำเร็จจริง
 */
export const cleanOcrTextWithLlm = async (rawText) => {
  if (!rawText || String(rawText).trim().length === 0) return { text: rawText || "", cleaned: false };
  const afterRules = postProcessOcrText(String(rawText));
  const fallback = () => ({ text: afterRules, cleaned: false });
  const useOllama = ocrLlmProvider === "ollama";
  if (!useOllama && !ocrLlmApiKey) {
    console.warn("OCR LLM cleanup skipped: OCR_LLM_PROVIDER=openai but OCR_LLM_API_KEY/OPENAI_API_KEY is not set. Set key in .env or use OCR_LLM_PROVIDER=ollama with Ollama running.");
    return fallback();
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.OCR_LLM_CLEANUP_TIMEOUT_MS || 60000);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const systemPrompt =
    `You are a text cleaner. งานของคุณ: แก้แค่คำผิดและจัดย่อหน้า/ช่องว่างเท่านั้น

กฎสำคัญ (ต้องทำตาม):
- ห้ามสรุปเนื้อหา ห้ามย่อ ห้ามตัดส่วนใดออก ห้ามเปลี่ยนความหมาย
- ต้องส่งกลับข้อความความยาวเท่าเดิม (หรือยาวขึ้นแค่จากบรรทัดใหม่ที่จัดให้) ทุกประโยคทุกข้อความต้องอยู่ครบ
- คำที่ควรติดกัน ถ้ามีช่องว่างคั่นให้รวมเป็นคำเดียว เช่น "ส านัก" → "สำนัก", "ส ำคัญ" → "สำคัญ", "มหาวิท ยาลัย" → "มหาวิทยาลัย", "โ ดย" → "โดย", "ด าเนินงาน" → "ดำเนินงาน", "การ งาน" → "การงาน" — และคำอื่นที่ผิดแบบเดียวกัน (มีช่องว่างกลางคำ) ให้แก้ในลักษณะเดียวกัน
- แก้สระที่ OCR ผิด: "ควำม" → "ความ", "เป็นมำ" → "เป็นมา", "ปัญหำ" → "ปัญหา", "บริกำร" → "บริการ", "วิทยบริกำร" → "วิทยบริการ", "สำรสนเทศ" → "สารสนเทศ", "บรรณำนุกรม" → "บรรณานุกรม" — ถ้าเจอคำอื่นที่ใช้ ำ ผิดบริบท (ควรเป็น า) ให้แก้เหมือนกัน
- ตัวเลขที่มีช่องว่างคั่น เช่น "25 61" → "2561"
- แก้เฉพาะ: (1) คำที่แบ่งผิด/คำที่ควรติดกัน (2) ช่องว่างเกิน (3) ตัวเลขผสม/ตัวเลขมีวรรค (4) คำสะกดผิด/สระผิด (5) เครื่องหมายวรรคตอน (6) จัดบรรทัด/ย่อหน้าให้อ่านง่าย
- ส่งกลับเฉพาะข้อความที่แก้แล้ว ไม่มีคำอธิบาย ไม่มีหัวข้อเพิ่ม`;

  try {
    if (useOllama) {
      const content = await callOllamaChat(systemPrompt, sanitizeTextForProvider(afterRules), controller.signal);
      clearTimeout(timeoutId);
      if (content) return { text: postProcessOcrText(content), cleaned: true };
      console.warn("OCR LLM cleanup: Ollama returned empty. Check ollama serve and OLLAMA_OCR_MODEL. Using rule-cleaned text.");
      return fallback();
    }
    const response = await fetch(`${ocrLlmBaseUrl}/chat/completions`, {
      method: "POST",
      dispatcher: gatewayDispatcher,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ocrLlmApiKey}`,
      },
      body: JSON.stringify({
        model: ocrLlmModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: sanitizeTextForProvider(afterRules) },
        ],
        temperature: 0.1,
        max_tokens: 16000,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn("OCR LLM cleanup failed:", response.status, await response.text());
      return fallback();
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content && typeof content === "string" && content.trim()) {
      return { text: postProcessOcrText(content.trim()), cleaned: true };
    }
  } catch (err) {
    if (err?.name === "AbortError") {
      console.warn("OCR LLM cleanup timed out, using rule-cleaned text");
    } else {
      console.warn("OCR LLM cleanup error, using rule-cleaned text", err?.message || err);
    }
    clearTimeout(timeoutId);
  }
  return fallback();
};

/** ส่งข้อความ (หลัง OCR/clean) ไปให้ LLM เรียบเรียงจัดโครงสร้าง: หัวข้อ ย่อหน้า รายการ (ใช้ก่อน embed) — รองรับ OpenAI หรือ Ollama */
export const structureOcrTextWithLlm = async (text) => {
  if (!text || String(text).trim().length === 0) return text;
  const baseText = postProcessOcrText(String(text));
  // ทำ pre-clean ก่อน 1 รอบ เพื่อให้คำผิด OCR ทั่วไปถูกแก้ก่อนเข้าโหมดจัดรูปแบบ
  // (ช่วยให้ปุ่ม "จัดเรียงด้วย AI" เห็นผลเรื่องแก้คำผิดชัดขึ้น)
  let sourceText = baseText;
  try {
    const cleaned = await cleanOcrTextWithLlm(baseText);
    const cleanedText = typeof cleaned === "object" && cleaned?.text != null ? cleaned.text : cleaned;
    if (cleanedText && String(cleanedText).trim()) {
      sourceText = postProcessOcrText(String(cleanedText).trim());
    }
  } catch {
    // ถ้า clean ไม่สำเร็จ ให้ใช้ baseText ต่อได้
    sourceText = baseText;
  }
  const useOllama = ocrLlmProvider === "ollama";
  if (!useOllama && !ocrLlmApiKey) return sourceText;

  const controller = new AbortController();
  const timeoutMs = Number(process.env.OCR_LLM_STRUCTURE_TIMEOUT_MS || 60000);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const systemPrompt =
    `You are a Thai OCR text cleaner + formatter (conservative mode).

งานของคุณ:
1) คงลำดับเนื้อหาเดิมทุกบรรทัดและทุกประโยค (ห้ามสลับลำดับ)
2) แก้คำผิดจาก OCR ให้มากที่สุด เช่น สระผิด วรรณยุกต์ตก ช่องว่างผิด ตัวอักษรแตกคำ คำไทยสะกดเพี้ยน
3) จัดรูปแบบให้อ่านง่ายขึ้นได้เฉพาะระดับย่อหน้า/ขึ้นบรรทัดใหม่

กฎบังคับ:
- ห้ามสรุป ห้ามย่อ ห้ามขยาย ห้ามเขียนใหม่
- ห้ามเพิ่มข้อมูลใหม่ และห้ามลบข้อมูลเดิม
- ห้ามเปลี่ยนความหมาย
- ห้ามเปลี่ยนข้อความเป็น bullet/หัวข้อใหม่ เว้นแต่ต้นฉบับมีอยู่แล้ว
- โฟกัสแค่ "แก้คำผิด + จัดวรรคตอน/ย่อหน้าให้อ่านง่าย"
- ถ้าพบคำสะกดผิดชัดเจน ต้องแก้ให้ถูกต้อง (ห้ามคงคำผิดไว้เฉยๆ)
- ส่งกลับเฉพาะข้อความผลลัพธ์ ไม่มีคำอธิบาย`;

  try {
    if (useOllama) {
      const content = await callOllamaChat(systemPrompt, sanitizeTextForProvider(sourceText), controller.signal);
      clearTimeout(timeoutId);
      if (content) return postProcessOcrText(content.trim());
      return sourceText;
    }
    const response = await fetch(`${ocrLlmBaseUrl}/chat/completions`, {
      method: "POST",
      dispatcher: gatewayDispatcher,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ocrLlmApiKey}`,
      },
      body: JSON.stringify({
        model: ocrLlmModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: sanitizeTextForProvider(sourceText) },
        ],
        temperature: 0.1,
        max_tokens: 16000,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn("OCR LLM structure failed:", response.status, await response.text());
      return sourceText;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content && typeof content === "string" && content.trim()) {
      return postProcessOcrText(content.trim());
    }
  } catch (err) {
    if (err?.name === "AbortError") {
      console.warn("OCR LLM structure timed out, using original text");
    } else {
      console.warn("OCR LLM structure error, using original text", err?.message || err);
    }
    clearTimeout(timeoutId);
  }
  return sourceText;
};

/** ตรวจว่าข้อความมีคำทักทายอยู่ข้างใน (ไม่จำเป็นต้องเป็นแค่คำทักทายอย่างเดียว) */
export const isGreeting = (text = "") => {
  const normalized = text.toLowerCase();
  const greetingPatterns = [
    /(^|\s)(hi|hello|hey)\b/,
    /สวัสดี/,
    /หวัดดี/,
    /ดีครับ/,
    /ดีค่ะ/,
    /ขอบคุณ/,
    /thank you/,
    /thanks/,
  ];
  return greetingPatterns.some((pattern) => pattern.test(normalized));
};

export const isGreetingOnly = (text = "") => {
  const normalized = text.toLowerCase().trim();
  const patterns = [
    /^(hi|hello|hey)[!?.\s]*$/,
    /^สวัสดี(ครับ|ค่ะ|นะ)?[!?.\s]*$/,
    /^หวัดดี(ครับ|ค่ะ|นะ)?[!?.\s]*$/,
    /^ดีครับ[!?.\s]*$/,
    /^ดีค่ะ[!?.\s]*$/,
    /^ขอบคุณ(ครับ|ค่ะ|นะ)?[!?.\s]*$/,
    /^(thank you|thanks)[!?.\s]*$/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
};
