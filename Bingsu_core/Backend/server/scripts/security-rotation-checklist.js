import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..", "..");

const readEnv = (fileName) => {
  const filePath = path.join(backendRoot, fileName);
  if (!fs.existsSync(filePath)) return {};
  try {
    return dotenv.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn(`[security] อ่าน ${fileName} ไม่สำเร็จ:`, error?.message || error);
    return {};
  }
};

const fileEnv = {
  ...readEnv(".env"),
  ...readEnv(".env.local"),
};

const sensitiveKeys = [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "EMBEDDING_API_KEY",
  "OCR_LLM_API_KEY",
  "TYPHOON_OCR_API_KEY",
  "QDRANT_API_KEY",
  "NGROK_AUTHTOKEN",
  "LINE_CHANNEL_SECRET",
  "LINE_CHANNEL_ACCESS_TOKEN",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "SMTP_PASSWORD",
  "INGEST_WEBHOOK_API_KEY",
  "RAG_EXTERNAL_RERANK_API_KEY",
];

const hasValue = (v) => typeof v === "string" && v.trim().length > 0;

const checklist = sensitiveKeys.map((key) => {
  const fromFile = fileEnv[key];
  const fromRuntime = process.env[key];
  const configured = hasValue(fromRuntime) || hasValue(fromFile);
  return {
    key,
    configured,
    source: hasValue(fromRuntime) ? "runtime" : hasValue(fromFile) ? "file" : "none",
  };
});

console.log("=== Security Rotation Checklist ===");
console.log("ตรวจจาก Backend/.env และ Backend/.env.local (ไม่แสดงค่า secret)");
console.log("");

checklist.forEach((item) => {
  const status = item.configured ? "ROTATE" : "EMPTY";
  const suffix = item.source !== "none" ? ` (${item.source})` : "";
  console.log(`- ${item.key}: ${status}${suffix}`);
});

const rotateCount = checklist.filter((item) => item.configured).length;
console.log("");
console.log(
  rotateCount > 0
    ? `พบ ${rotateCount} รายการที่มีค่าอยู่ — แนะนำให้ rotate key ทั้งหมด`
    : "ไม่พบ key ที่ต้อง rotate ในไฟล์ env ภายใต้ Backend",
);
