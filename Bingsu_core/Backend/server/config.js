import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(backendRoot, ".env.local") });
dotenv.config({ path: path.join(backendRoot, ".env") });
dotenv.config({ path: ".env.local" });
dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL. Set it in .env.local or .env.");
  process.exit(1);
}

/** พอร์ตหลัก — ตั้ง 80 เพื่อเปิด http://localhost/create-knowledge ได้โดยไม่ต้องใส่พอร์ต */
export const port = Number(process.env.PORT || 5050);
export const sessionTtlDaysSafe = Number.isFinite(Number(process.env.SESSION_TTL_DAYS || 30))
  ? Number(process.env.SESSION_TTL_DAYS || 30)
  : 30;
const isProductionEnv = process.env.NODE_ENV === "production";
export const sessionCookieName = (process.env.SESSION_COOKIE_NAME || "session_token").trim() || "session_token";
export const sessionCookieSecure = (process.env.SESSION_COOKIE_SECURE || "").toLowerCase() === "true" || isProductionEnv;
export const sessionCookieSameSite = (process.env.SESSION_COOKIE_SAME_SITE || "lax").trim().toLowerCase();
export const sessionCookieDomain = (process.env.SESSION_COOKIE_DOMAIN || "").trim() || undefined;
export const gatewayBaseUrl = process.env.GATEWAY_BASE_URL || "https://aigateway.ntictsolution.com/v1";
export const openaiKey = process.env.OPENAI_API_KEY;
export const openaiModel = process.env.OPENAI_MODEL || "ict-ollama/gpt-oss:120b";
export const openaiFallbackModel = (process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini").trim();
/** Gateway สำรอง (อันดับ 2) — ค่าเริ่มต้นใช้ GATEWAY_BASE_URL เดียวกับ primary */
export const openaiFallbackBaseUrl = (process.env.OPENAI_FALLBACK_BASE_URL || "").trim().replace(/\/+$/, "") || gatewayBaseUrl;
/** API key สำรอง — ค่าเริ่มต้นใช้ OPENAI_API_KEY เดียวกับ primary */
export const openaiFallbackKey = (process.env.OPENAI_FALLBACK_API_KEY || "").trim() || openaiKey;
export const openaiDeploymentRetryAttempts = Math.max(0, Math.min(5, Number(process.env.OPENAI_DEPLOYMENT_RETRY_ATTEMPTS || 2)));
export const openaiDeploymentRetryBaseDelayMs = Math.max(500, Number(process.env.OPENAI_DEPLOYMENT_RETRY_BASE_DELAY_MS || 2500));
export const redisUrl = process.env.REDIS_URL;
export const cacheTtlSeconds = Number(process.env.CACHE_TTL_SECONDS || 30);
export const rateLimitRedisPrefix = process.env.RATE_LIMIT_REDIS_PREFIX || "rate";
/** Vector DB: "qdrant" (default) หรือ "pinecone" */
export const vectorDb = (process.env.VECTOR_DB || "qdrant").trim().toLowerCase();
export const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
export const qdrantApiKey = process.env.QDRANT_API_KEY || "";
export const qdrantCollectionName = process.env.QDRANT_COLLECTION || "documents";
export const qdrantDistance = process.env.QDRANT_DISTANCE || "Cosine";
/** จำนวน chunk ที่ดึงจาก Qdrant ต่อคำถาม — เยอะขึ้นช่วยให้เจอเนื้อหาแบบ มาตรา/ข้อกำหนด (default 12) */
export const qdrantTopK = Number(process.env.QDRANT_TOP_K || 12);
/** Rerank: ดึง chunk มาก่อนแล้วเรียงใหม่ด้วยความเกี่ยวข้องกับคำถาม (เปิดใช้จะได้คำตอบตรงคำถามมากขึ้น) */
export const ragRerankEnabled = (process.env.RAG_RERANK_ENABLED || "true").toLowerCase() === "true";
export const ragRerankRetrieveMultiplier = Math.max(1, Math.min(5, Number(process.env.RAG_RERANK_RETRIEVE_MULTIPLIER || 2)));
export const ragExternalRerankEnabled = (process.env.RAG_EXTERNAL_RERANK_ENABLED || "false").toLowerCase() === "true";
export const ragExternalRerankUrl = (process.env.RAG_EXTERNAL_RERANK_URL || "").trim();
export const ragExternalRerankApiKey = (process.env.RAG_EXTERNAL_RERANK_API_KEY || "").trim();
export const ragExternalRerankModel = (process.env.RAG_EXTERNAL_RERANK_MODEL || "").trim();
export const ragExternalRerankTimeoutMs = Math.max(1000, Number(process.env.RAG_EXTERNAL_RERANK_TIMEOUT_MS || 10000));
/** คำตอบฟิก (hardcoded rules เช่น ราคา NT Dark Fiber/อำนาจอนุมัติ) — ตั้ง false เพื่อให้ตอบจาก knowledge (RAG) แทน เมื่อ knowledge พร้อมแล้ว */
export const deterministicRulesEnabled = (process.env.DETERMINISTIC_RULES_ENABLED || "true").toLowerCase() === "true";
// Pinecone (เมื่อ VECTOR_DB=pinecone)
export const pineconeApiKey = process.env.PINECONE_API_KEY || "";
export const pineconeIndexName = (process.env.PINECONE_INDEX || "documents").trim();
// Embeddings: openai or gemini
export const embeddingProvider = (process.env.EMBEDDING_PROVIDER || "openai").trim().toLowerCase();
export const embeddingBaseUrl = (process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
export const embeddingApiKey = process.env.EMBEDDING_API_KEY || "";
export const embeddingModel = process.env.EMBEDDING_MODEL
  || (embeddingProvider === "gemini" ? "models/gemini-embedding-001" : "text-embedding-3-small");
export const embeddingBatchSize = Math.min(200, Math.max(10, Number(process.env.EMBEDDING_BATCH_SIZE || 100)));
export const embeddingTimeoutMs = Number(process.env.EMBEDDING_TIMEOUT_MS || 10000);
const parseCsvEnv = (value, fallback) => {
  if (!value) return fallback;
  const parsed = String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
};
export const allowedUploadMimeTypes = parseCsvEnv(
  process.env.ALLOWED_UPLOAD_MIME_TYPES,
  [
    "application/pdf",
    "text/plain",
    "text/markdown",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
  ],
);
export const allowedUploadExtensions = parseCsvEnv(
  process.env.ALLOWED_UPLOAD_EXTENSIONS,
  [".pdf", ".txt", ".md", ".xlsx", ".xls", ".csv"],
);
export const maxUploadFileBytes = Number.isFinite(Number(process.env.MAX_UPLOAD_FILE_MB || 200))
  ? Number(process.env.MAX_UPLOAD_FILE_MB || 200) * 1024 * 1024
  : 200 * 1024 * 1024;

// Raw/original file storage policy
// - When false: we keep only extracted text/blocks + embeddings for RAG, and do NOT store original files.
// - This also disables original file download endpoint.
export const storeRawFiles = (process.env.STORE_RAW_FILES || "true") === "true";
export const fileStorageProvider =
  process.env.FILE_STORAGE_PROVIDER || (process.env.S3_BUCKET ? "s3" : "local");
export const s3Endpoint = process.env.S3_ENDPOINT || "";
export const s3Region = process.env.S3_REGION || "us-east-1";
export const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID || "";
export const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "";
export const s3Bucket = process.env.S3_BUCKET || "";
export const s3PublicUrl = process.env.S3_PUBLIC_URL || "";
export const s3ForcePathStyle = (process.env.S3_FORCE_PATH_STYLE || "true") === "true";

export const isProduction = isProductionEnv;
// CORS allow-list (comma-separated in env) — safer than reflecting any origin.
const fallbackCorsOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3014",
  "http://127.0.0.1:3014",
  "http://localhost:8083",
  "http://127.0.0.1:8083",
];
const envCorsOrigins = parseCsvEnv(process.env.CORS_ORIGINS, []);
const allowedCorsOrigins = new Set(
  (envCorsOrigins.length
    ? envCorsOrigins
    : fallbackCorsOrigins
  ).map((origin) => String(origin || "").trim()).filter(Boolean),
);
export const isCorsOriginAllowed = (origin) =>
  !!origin && allowedCorsOrigins.has(String(origin).trim());
export const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    // Allow non-browser clients (no Origin header): curl, internal jobs, health checks.
    if (!origin) return callback(null, true);
    if (isCorsOriginAllowed(origin)) return callback(null, true);
    return callback(new Error("CORS origin denied"));
  },
};
export const frontendUrl = (process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
export const smtpServer = (process.env.SMTP_SERVER || "").trim();
export const smtpPort = Number(process.env.SMTP_PORT || 587);
export const smtpUser = (process.env.SMTP_USER || "").trim();
export const smtpPassword = process.env.SMTP_PASSWORD || "";
export const smtpSecure = (process.env.SMTP_SECURE || "").toLowerCase() === "true";
export const smtpFrom = (process.env.SMTP_FROM || process.env.SMTP_USER || "").trim();
export const supportApprovalEmail = (process.env.SUPPORT_APPROVAL_EMAIL || "").trim();
export const supportAdminUrl = (process.env.SUPPORT_ADMIN_URL || "").trim().replace(/\/+$/, "");
export const emailSendRetryAttempts = Math.max(1, Math.min(5, Number(process.env.EMAIL_SEND_RETRY_ATTEMPTS || 3)));
export const emailSendRetryBaseDelayMs = Math.max(250, Number(process.env.EMAIL_SEND_RETRY_BASE_DELAY_MS || 1500));
export const emailAlertWebhookUrl = (process.env.EMAIL_ALERT_WEBHOOK_URL || "").trim();
export const emailAlertWebhookToken = (process.env.EMAIL_ALERT_WEBHOOK_TOKEN || "").trim();
export const strictPrivacyMode = (process.env.STRICT_PRIVACY_MODE || "false").toLowerCase() === "true";
export const systemLogRetentionDays = Math.max(1, Number(process.env.SYSTEM_LOG_RETENTION_DAYS || 180));
export const systemLogRetentionIntervalMs = Math.max(60_000, Number(process.env.SYSTEM_LOG_RETENTION_INTERVAL_MS || 3_600_000));
export const messageStoreRedaction = (process.env.MESSAGE_STORE_REDACTION || "false").toLowerCase() === "true";
export const fullUserMessageRedaction = (process.env.FULL_USER_MESSAGE_REDACTION || "false").toLowerCase() === "true";
export const fullConversationTitleRedaction = (process.env.FULL_CONVERSATION_TITLE_REDACTION || "false").toLowerCase() === "true";
export const chatRetentionDays = Math.max(0, Number(process.env.CHAT_RETENTION_DAYS || 0));
export const chatRetentionIntervalMs = Math.max(60_000, Number(process.env.CHAT_RETENTION_INTERVAL_MS || 3_600_000));

export const MAX_UPLOAD_PART_MB = Number(process.env.MAX_UPLOAD_PART_MB || 20);
export const MAX_UPLOAD_PART_BYTES = Number.isFinite(MAX_UPLOAD_PART_MB)
  ? MAX_UPLOAD_PART_MB * 1024 * 1024
  : 10 * 1024 * 1024;
export const PDF_SPLIT_PAGE_THRESHOLD = Number(process.env.PDF_SPLIT_PAGE_THRESHOLD || 400);
export const PDF_PAGES_PER_CHUNK = Number(process.env.PDF_PAGES_PER_CHUNK || 50);
/** ขนาด chunk ใหญ่ขึ้น = ชิ้นน้อยลง = เรียก embed น้อยลง = อัปโหลดเร็วขึ้น (ถ้า text เยอะ) */
export const TEXT_CHUNK_SIZE = Number(process.env.TEXT_CHUNK_SIZE || 2800);
export const TEXT_CHUNK_OVERLAP = Number(process.env.TEXT_CHUNK_OVERLAP || 150);
export const RAG_TIMEOUT_MS = Number(process.env.RAG_TIMEOUT_MS || 2000);
export const requireEmailVerification = (process.env.REQUIRE_EMAIL_VERIFICATION || "false") === "true";
/** When true, new signups get approvalStatus "approved" and can login immediately (for dev/demo). */
export const allowSignupAutoApprove = (process.env.ALLOW_SIGNUP_AUTO_APPROVE || "false") === "true";
export const emailVerificationTokenTtlHours = Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS || 24);
export const passwordResetTokenTtlHours = Number(process.env.PASSWORD_RESET_TOKEN_TTL_HOURS || 2);
const parseJsonEnv = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};
const defaultRagSynonyms = {
  "ความสามารถ": ["skill", "ability", "competency"],
  "ทักษะ": ["skill", "ability", "competency"],
  "skill": ["ความสามารถ", "ทักษะ", "ability", "competency"],
  "ability": ["ความสามารถ", "ทักษะ", "skill", "competency"],
  "competency": ["ความสามารถ", "ทักษะ", "skill", "ability"],
  // Thai phrasing variants that often mean the same thing but embed differently
  "ทั้งเอกสาร": ["เอกสารทั้งหมด", "ทั้งเอกสารทั้งหมด"],
  "เอกสารทั้งหมด": ["ทั้งเอกสาร"],
  "สรุปทั้งเอกสาร": ["สรุปเอกสารทั้งหมด", "สรุปเนื้อหาทั้งหมด", "สรุปเนื้อหาโดยรวม"],
  "สรุปเอกสารทั้งหมด": ["สรุปทั้งเอกสาร", "สรุปเนื้อหาทั้งหมด", "สรุปเนื้อหาโดยรวม"],
};
const envRagSynonyms = parseJsonEnv(process.env.RAG_QUERY_SYNONYMS);
export const ragQuerySynonyms = envRagSynonyms && typeof envRagSynonyms === "object"
  ? { ...defaultRagSynonyms, ...envRagSynonyms }
  : defaultRagSynonyms;
export const ragQueryVariantLimit = Number(process.env.RAG_QUERY_VARIANT_LIMIT || 4);
/** Multi-hop (query decomposition): แตกคำถามซับซ้อนหลายเงื่อนไขเป็นคำถามย่อยเพื่อค้นให้ครบ (คำถามง่ายไม่ถูกแตก) — ตั้ง false เพื่อปิด */
export const multiHopEnabled = (process.env.MULTI_HOP_ENABLED || "true").toLowerCase() === "true";

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));
const parseNumberEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const CHAT_TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS || 8000);
export const CHAT_TEMPERATURE = clampNumber(parseNumberEnv(process.env.CHAT_TEMPERATURE, 0.2), 0, 2);
export const CHAT_MAX_TOKENS = Math.max(1, Math.floor(parseNumberEnv(process.env.CHAT_MAX_TOKENS, 600)));
/** จำนวนชิ้น context ส่งให้ LLM — เยอะขึ้นช่วยตอบคำถามแบบ สรุป/มาตรา/ข้อกำหนด (default 12) */
export const MAX_CONTEXT_PIECES = Number(process.env.MAX_CONTEXT_PIECES || 12);
export const CONTEXT_NEIGHBOR_WINDOW = Number(process.env.CONTEXT_NEIGHBOR_WINDOW || 0);
export const GREETING_REPLY = process.env.GREETING_REPLY || "สวัสดีครับ มีอะไรให้ช่วยไหมครับ";
export const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
/** จำนวน request สูงสุดต่อ window (แชท/อัปโหลด) — default 600 ต่อนาที */
export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 600);
export const MAX_DAILY_UPLOAD_BYTES = Number(process.env.MAX_DAILY_UPLOAD_BYTES || 2_000_000_000);
export const MAX_DAILY_CHAT_MESSAGES = Number(process.env.MAX_DAILY_CHAT_MESSAGES || 2000);
/** จำนวนข้อความย้อนหลังที่ส่งให้โมเดล (user+model คู่) เพื่อให้จดจำบริบทบทสนทนา — ค่าเยอะ = จดจำคำถามก่อนหน้าได้นานขึ้น (default 50) */
export const MAX_CHAT_HISTORY_MESSAGES = Math.max(0, Math.floor(parseNumberEnv(process.env.MAX_CHAT_HISTORY_MESSAGES, 50)));
/** โควต้าโทเค็นแชทต่อวันต่อคน — 0 = ไม่จำกัด (default 500,000) */
export const FREE_DAILY_TOKEN_LIMIT = Math.max(0, Math.floor(parseNumberEnv(process.env.FREE_DAILY_TOKEN_LIMIT, 500_000)));
export const FREE_KNOWLEDGE_LIMIT = Math.max(0, Math.floor(parseNumberEnv(process.env.FREE_KNOWLEDGE_LIMIT, 30)));

export const uploadQueueName = process.env.UPLOAD_QUEUE_NAME || "upload:queue";
export const uploadQueueMode = process.env.UPLOAD_QUEUE_MODE || (redisUrl ? "redis" : "memory");

/** เมื่อเปิด จะส่งข้อความจาก OCR (เช่น PaddleOCR) ไปให้ LLM จัดรูปแบบ/แก้คำผิดก่อนนำไป embed — ค่าเริ่มต้น true เพื่อให้ผู้ใช้เห็นข้อความที่ OCR+LLM เรียบเรียงแล้ว */
export const ocrLlmCleanup = (process.env.OCR_LLM_CLEANUP || "true").toLowerCase() === "true";
/** ผู้ให้บริการ LLM สำหรับ OCR cleanup: "openai" (ใช้ GATEWAY + OPENAI_API_KEY หรือ OCR_LLM_*) หรือ "ollama" (รันในเครื่อง ไม่ส่งข้อมูลออก) */
export const ocrLlmProvider = (process.env.OCR_LLM_PROVIDER || "openai").trim().toLowerCase();
/** API key สำหรับ LLM ที่ใช้จัดรูปแบบข้อความจาก Paddle (จัดเรียง/แก้คำผิด) — ถ้าไม่ใส่จะใช้ OPENAI_API_KEY (LLM มาจาก AI Gateway ของ NT ใช้ร่วมกับ Paddle + LLM) */
export const ocrLlmApiKey = (process.env.OCR_LLM_API_KEY || "").trim() || openaiKey;
/** โมเดลสำหรับ OCR cleanup/structure เมื่อใช้ openai — ถ้าไม่ใส่จะใช้ OPENAI_MODEL (ตัวอย่าง: ict-ollama/deepseek-coder-v2:16b ผ่าน AI Gateway) */
export const ocrLlmModel = (process.env.OCR_LLM_MODEL || "").trim() || openaiModel;
/** Base URL สำหรับเรียก LLM ของ OCR — ถ้าไม่ใส่จะใช้ GATEWAY_BASE_URL (aigateway.ntictsolution.com) เหมือนแชท */
export const ocrLlmBaseUrl = (process.env.OCR_LLM_BASE_URL || "").trim().replace(/\/+$/, "") || gatewayBaseUrl;
/** URL ของ Ollama (ใช้เมื่อ OCR_LLM_PROVIDER=ollama) เช่น http://localhost:11434 */
export const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
/** โมเดล Ollama สำหรับจัดเรียง/แก้คำผิดจาก OCR (เช่น llama3.2, gemma2:2b) */
export const ollamaOcrModel = (process.env.OLLAMA_OCR_MODEL || "llama3.2").trim() || "llama3.2";
/** เมื่อเปิดร่วมกับ OCR_LLM_CLEANUP จะ clean แยกแต่ละหน้า → ข้อความที่ได้มีโครงสร้างแบ่งหน้า (ช้ากว่าเพราะเรียก LLM หลายครั้ง) */
export const ocrLlmCleanupPerPage = (process.env.OCR_LLM_CLEANUP_PER_PAGE || "false").toLowerCase() === "true";
/** เมื่อเปิด จะส่งข้อความ (หลัง OCR/clean) ไปให้ LLM เรียบเรียงจัดโครงสร้าง: หัวข้อ ย่อหน้า รายการ ก่อนนำไป embed */
export const ocrLlmStructure = (process.env.OCR_LLM_STRUCTURE || "false").toLowerCase() === "true";
/** เมื่อเปิด ทุก PDF จะผ่าน OCR เสมอ. เมื่อปิด (ค่าเริ่มต้น): PDF ที่ดึง text ได้ใช้ text โดยตรง, PDF สแกน (ข้อความน้อย) ถึงจะใช้ Typhoon OCR */
export const ocrAlwaysForPdf = (process.env.OCR_ALWAYS_FOR_PDF || "false").toLowerCase() === "true";
/** ดึงข้อความจาก PDF โดยตรง: "pdfjs" = ใช้ pdfjs-dist ใน Node (ค่าเริ่มต้น) | "pdfplumber" = ใช้ Python pdfplumber (ต้องมีสคริปต์ Service/Website/scripts/extract_pdf_plumber.py) */
export const pdfProvider = (process.env.PDF_PROVIDER || "pdfjs").trim().toLowerCase();

/** Webhook รับข้อความจาก n8n (เช่น ผล OCR จาก Typhoon ที่ส่งทางอีเมล) — ใส่ API key กับ User ID ที่จะเป็นเจ้าของ Knowledge */
export const ingestWebhookApiKey = (process.env.INGEST_WEBHOOK_API_KEY || "").trim();
export const ingestWebhookUserId = (process.env.INGEST_WEBHOOK_USER_ID || "").trim();

/** LINE Messaging API — ใส่ใน .env เพื่อเปิดรับข้อความจาก LINE */
export const lineChannelSecret = (process.env.LINE_CHANNEL_SECRET || "").trim();
export const lineChannelAccessToken = (process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim();
/** User ID ในระบบที่ถือว่าเป็น "เจ้าของ" แชท LINE (ใช้สร้าง conversation) */
export const lineDefaultUserId = (process.env.LINE_DEFAULT_USER_ID || "").trim();
/** Document ID ที่ใช้ตอบคำถามจาก LINE — ถ้าไม่ใส่แต่ใส่ LINE_DEFAULT_BOT_ID จะดึงจากชุดความรู้ที่ผูกกับบอทนั้น */
export const lineDefaultDocumentId = (process.env.LINE_DEFAULT_DOCUMENT_ID || "").trim();
/** Bot ที่เลือกเชื่อมกับ LINE (บอทนี้ผูก Knowledge อยู่แล้ว จะใช้ชุดความรู้ของบอทนี้) */
export const lineDefaultBotId = (process.env.LINE_DEFAULT_BOT_ID || "").trim() || null;
/** URL หลักของระบบ (สำหรับแสดง LINE Webhook URL ในฟอร์ม) เช่น https://xxx.ngrok-free.app หรือ https://yourdomain.com */
export const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || "").trim().replace(/\/+$/, "");
