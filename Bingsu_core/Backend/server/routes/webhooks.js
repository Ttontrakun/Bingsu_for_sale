/**
 * Webhook รับข้อความจาก n8n (เช่น ผล OCR จาก Typhoon Async ที่ส่งทางอีเมล)
 * สร้าง Knowledge (document) + embed + เก็บใน vector DB
 * และรับ Webhook จาก LINE Messaging API
 */
import crypto from "crypto";
import express from "express";
import { prisma } from "../db.js";
import {
  ingestWebhookApiKey,
  ingestWebhookUserId,
  qdrantCollectionName,
  lineChannelSecret,
  lineChannelAccessToken,
  lineDefaultUserId,
  lineDefaultDocumentId,
  lineDefaultBotId,
} from "../config.js";
import { invalidateUserCaches } from "../lib/cache.js";
import { indexDocumentChunks } from "../services/vectorDb.js";
import { ensureSourceFileBlocks } from "../services/text.js";
import { getChatReplyForLine } from "./conversations.js";

export const webhooksRouter = express.Router();

/** map lineUserId -> conversationId (ในหน่วยความจำ — restart แล้วเริ่มแชทใหม่) */
const lineConversationMap = new Map();

const getApiKey = (req) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return (req.headers["x-api-key"] || "").trim();
};

/** POST /api/webhooks/ocr-ingest — รับข้อความ (จาก n8n หลังได้ผล OCR จากอีเมล) → สร้าง document + embed */
webhooksRouter.post("/ocr-ingest", async (req, res) => {
  if (!ingestWebhookApiKey) {
    return res.status(503).json({ error: "Ingest webhook is not configured (INGEST_WEBHOOK_API_KEY)" });
  }
  const key = getApiKey(req);
  if (key !== ingestWebhookApiKey) {
    return res.status(401).json({ error: "Invalid or missing API key (X-API-Key or Authorization: Bearer)" });
  }
  const { displayName, text, userId: bodyUserId, userEmail: bodyUserEmail } = req.body ?? {};
  const hasBodyUser = (typeof bodyUserId === "string" && bodyUserId.trim()) || (typeof bodyUserEmail === "string" && bodyUserEmail.trim());
  if (!ingestWebhookUserId && !hasBodyUser) {
    return res.status(503).json({ error: "Set INGEST_WEBHOOK_USER_ID in .env or send body.userId / body.userEmail" });
  }

  const rawText = typeof text === "string" ? text.trim() : "";
  if (!rawText) {
    return res.status(400).json({ error: "body.text is required (string, the OCR result)" });
  }

  let user = null;
  const uid = typeof bodyUserId === "string" ? bodyUserId.trim() : "";
  const email = typeof bodyUserEmail === "string" ? bodyUserEmail.trim() : "";
  if (uid) {
    user = await prisma.user.findUnique({ where: { id: uid } });
  } else if (email) {
    user = await prisma.user.findUnique({ where: { email } });
  }
  if (!user && ingestWebhookUserId) {
    user = await prisma.user.findUnique({ where: { id: ingestWebhookUserId } });
  }
  if (!user) {
    return res.status(400).json({
      error: "User not found. Set body.userId or body.userEmail, or set INGEST_WEBHOOK_USER_ID in .env",
    });
  }

  const name = typeof displayName === "string" && displayName.trim()
    ? displayName.trim().slice(0, 255)
    : `OCR from email ${new Date().toISOString().slice(0, 10)}`;

  const sourceFiles = ensureSourceFileBlocks([{ name: "from-email.txt", text: rawText }]);
  const document = await prisma.document.create({
    data: {
      displayName: name,
      ragStoreName: qdrantCollectionName,
      sourceFiles,
      ownerId: user.id,
      tags: [],
      link: null,
    },
  });

  try {
    await indexDocumentChunks({
      documentId: document.id,
      userId: user.id,
      sourceFiles,
    });
    await invalidateUserCaches(user.id);
    return res.status(201).json({ documentId: document.id, displayName: name });
  } catch (error) {
    await prisma.document.delete({ where: { id: document.id } }).catch(() => null);
    console.error("Webhook ocr-ingest: index failed", error);
    return res.status(500).json({ error: "Failed to index document (embedding or vector DB)" });
  }
});

// ---------- LINE Messaging API Webhook ----------
const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";

function sanitizeLineText(text) {
  let s = String(text ?? "");
  // Remove separator lines like "***", "****" that sometimes leak into outputs
  s = s.replace(/^\s*\*{3,}\s*$/gm, "");
  // Remove inline long runs of asterisks
  s = s.replace(/\*{4,}/g, "");
  // Strip markdown bold markers for LINE (e.g. **text** -> text)
  s = s.replace(/\*\*(.+?)\*\*/g, "$1");
  s = s.replace(/\*\*/g, "");
  // Strip markdown italic markers for LINE (e.g. *text* or _text_ -> text)
  s = s.replace(/\*(?!\*)([^*]+)\*(?!\*)/g, "$1");
  s = s.replace(/_([^_]+)_/g, "$1");
  // Collapse excessive blank lines
  s = s.replace(/\n{4,}/g, "\n\n\n");
  return s.trim();
}

function verifyLineSignatureWithSecret(bodyRaw, signature, channelSecret) {
  if (!channelSecret || !signature) return false;
  const hash = crypto.createHmac("sha256", channelSecret).update(bodyRaw).digest("base64");
  return hash === signature;
}

async function replyLineWithToken(replyToken, text, channelAccessToken) {
  if (!channelAccessToken) return;
  const clean = sanitizeLineText(text);
  if (!clean) return;
  const res = await fetch(LINE_REPLY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text: clean.slice(0, 5000) }],
    }),
  });
  if (!res.ok) {
    console.error("LINE reply failed:", res.status, await res.text());
  }
}

async function replyLineMany(replyToken, texts, channelAccessToken) {
  if (!channelAccessToken) return;
  const list = (Array.isArray(texts) ? texts : [texts])
    .map((t) => (t == null ? "" : String(t)))
    .map((t) => sanitizeLineText(t))
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5);
  if (!list.length) return;
  const res = await fetch(LINE_REPLY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: list.map((t) => ({ type: "text", text: t.slice(0, 5000) })),
    }),
  });
  if (!res.ok) {
    console.error("LINE reply failed:", res.status, await res.text());
  }
}

/** GET /api/webhooks/line — LINE ใช้เรียก verify URL */
webhooksRouter.get("/line", (_req, res) => {
  res.status(200).send("OK");
});

/**
 * หา LINE integration: จาก .env หรือจาก DB (ฟอร์มเลือกบอท + ใส่ Token/Secret)
 * คืน { ownerUserId, botId, channelAccessToken } หรือ null
 */
async function resolveLineIntegration(rawBody, signature) {
  if (lineChannelSecret && verifyLineSignatureWithSecret(rawBody, signature, lineChannelSecret)) {
    if (lineChannelAccessToken && lineDefaultUserId && (lineDefaultDocumentId || lineDefaultBotId)) {
      return {
        ownerUserId: lineDefaultUserId,
        botId: lineDefaultBotId || undefined,
        channelAccessToken: lineChannelAccessToken,
        useEnv: true,
      };
    }
  }
  const rows = await prisma.integrationSetting.findMany({
    where: { provider: "line", enabled: true },
  });
  for (const row of rows) {
    const config = row?.config;
    const secret = config?.channelSecret;
    if (secret && verifyLineSignatureWithSecret(rawBody, signature, secret)) {
      const botIdRaw = config?.botId;
      const tokenRaw = config?.channelAccessToken;
      const botId = botIdRaw != null ? String(botIdRaw).trim() : "";
      const token = tokenRaw != null ? String(tokenRaw).trim() : "";
      if (botId && token) {
        return {
          ownerUserId: row.userId,
          botId,
          channelAccessToken: token,
          useEnv: false,
        };
      }
    }
  }
  return null;
}

/**
 * POST /api/webhooks/line — รับเหตุการณ์จาก LINE (ต้อง mount ด้วย express.raw() ใน app.js)
 * รองรับทั้งการตั้งค่าใน .env และการบันทึกจากฟอร์ม (IntegrationSetting provider=line)
 */
export async function handleLineWebhookPost(req, res) {
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    return res.status(400).json({ error: "Invalid body (expected raw buffer for LINE)" });
  }
  const signature = (req.headers["x-line-signature"] || "").trim();
  const integration = await resolveLineIntegration(rawBody, signature);
  if (!integration) {
    return res.status(401).send("Invalid signature or no LINE integration configured");
  }

  const { ownerUserId, botId, channelAccessToken } = integration;
  // สำคัญ: key ต้องรวม botId ด้วย เพื่อให้ "เปลี่ยนบอทที่ผูก" แล้วเริ่ม conversation ใหม่
  // ไม่งั้น LINE user เดิมจะค้าง conversation เก่าและใช้ knowledge/bot เก่า ทำให้ตอบว่า "ไม่มีในฐานข้อมูล" ได้
  const mapKey = (lineUserId, resolvedBotId) =>
    integration.useEnv
      ? `${lineUserId}:${resolvedBotId || ""}`
      : `${ownerUserId}:${lineUserId}:${resolvedBotId || ""}`;

  let events;
  try {
    events = JSON.parse(rawBody.toString("utf8")).events || [];
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  res.status(200).send("OK");

  const replyLine = (replyToken, text) => replyLineWithToken(replyToken, text, channelAccessToken);
  const replyLineMulti = (replyToken, texts) => replyLineMany(replyToken, texts, channelAccessToken);

  for (const event of events) {
    if (event.type !== "message" || event.message?.type !== "text") continue;
    const replyToken = event.replyToken;
    const lineUserId = event.source?.userId;
    const text = (event.message?.text || "").trim();
    if (!replyToken || !lineUserId || !text) continue;

    try {
      const resolvedBotId = botId || lineDefaultBotId;
      const key = mapKey(lineUserId, resolvedBotId);
      const ensureConversation = async () => {
        let conversationId = lineConversationMap.get(key);
        if (conversationId) return { conversationId, isNew: false, bot: null };

        let documentId = integration.useEnv ? lineDefaultDocumentId : null;
        let bot = null;
        if (resolvedBotId) {
          bot = await prisma.bot.findUnique({
            where: { id: resolvedBotId },
            include: { documents: { include: { document: true } } },
          });
          const firstDoc = bot?.documents?.[0]?.document;
          if (!firstDoc) return null;
          documentId = firstDoc.id;
        }
        if (!documentId) return null;

        const conv = await prisma.conversation.create({
          data: {
            userId: ownerUserId,
            documentId,
            botId: resolvedBotId || undefined,
          },
        });
        conversationId = conv.id;
        lineConversationMap.set(key, conversationId);
        return { conversationId, isNew: true, bot };
      };

      // 1) สร้าง/หา conversation
      let ensured = await ensureConversation();
      if (!ensured || !ensured.conversationId) {
        if (resolvedBotId) {
          await replyLine(
            replyToken,
            "ขออภัยครับ บอทที่เชื่อม LINE ยังไม่มีชุดความรู้ กรุณาตั้งค่าผูก Knowledge กับบอทในเว็บก่อน",
          ).catch(() => {});
        } else {
          await replyLine(
            replyToken,
            "ขออภัยครับ ยังไม่ได้ตั้งค่า LINE (เลือกบอทที่ผูก Knowledge หรือใส่ LINE_DEFAULT_DOCUMENT_ID)",
          ).catch(() => {});
        }
        continue;
      }
      let conversationId = ensured.conversationId;

      const buildIntegrationBanner = () => {
        const b = ensured.bot;
        if (!resolvedBotId) return null;
        const botName = b?.name ? String(b.name) : "บอท";
        const docs = (b?.documents || []).map((l) => l?.document).filter(Boolean);
        const names = docs.map((d) => d.displayName || d.fileName || d.id).filter(Boolean);
        const head = `ตั้งค่า LINE เรียบร้อย ✅\nบอทที่เชื่อม: ${botName}`;
        if (!names.length) return `${head}\nKnowledge ที่ผูก: (ยังไม่มี)`;
        const shown = names.slice(0, 6);
        const tail = names.length > shown.length ? `\n…และอีก ${names.length - shown.length} รายการ` : "";
        return `${head}\nKnowledge ที่ผูก (${names.length}):\n- ${shown.join("\n- ")}${tail}`;
      };

      // 2) ตอบคำถาม (ถ้า conversation หาย/ถูกลบ ให้สร้างใหม่แล้ว retry 1 ครั้ง)
      try {
        const { reply } = await getChatReplyForLine(conversationId, text, ownerUserId);
        if (ensured.isNew) {
          const banner = buildIntegrationBanner();
          if (banner) {
            await replyLineMulti(replyToken, [banner, reply]);
          } else {
            await replyLine(replyToken, reply);
          }
        } else {
          await replyLine(replyToken, reply);
        }
      } catch (innerErr) {
        const msg = innerErr?.message || "";
        if (String(msg).includes("Conversation not found")) {
          lineConversationMap.delete(key);
          ensured = await ensureConversation();
          if (!ensured || !ensured.conversationId) throw innerErr;
          conversationId = ensured.conversationId;
          const { reply } = await getChatReplyForLine(conversationId, text, ownerUserId);
          if (ensured.isNew) {
            const banner = buildIntegrationBanner();
            if (banner) {
              await replyLineMulti(replyToken, [banner, reply]);
            } else {
              await replyLine(replyToken, reply);
            }
          } else {
            await replyLine(replyToken, reply);
          }
        } else {
          throw innerErr;
        }
      }
    } catch (err) {
      console.error("LINE webhook process error:", err?.message || err);
      await replyLine(replyToken, "ขออภัยครับ เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่ในภายหลัง").catch(() => {});
    }
  }
}
