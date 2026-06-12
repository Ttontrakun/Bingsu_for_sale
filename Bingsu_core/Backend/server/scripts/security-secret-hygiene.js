import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..", "..");

const loadEnvFile = (fileName) => {
  const filePath = path.join(backendRoot, fileName);
  if (!fs.existsSync(filePath)) return {};
  try {
    return dotenv.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
};

const envFile = {
  ...loadEnvFile(".env"),
  ...loadEnvFile(".env.local"),
};

const SECRET_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_FALLBACK_MODEL",
  "EMBEDDING_API_KEY",
  "OCR_LLM_API_KEY",
  "TYPHOON_OCR_API_KEY",
  "RAG_EXTERNAL_RERANK_API_KEY",
  "SMTP_PASSWORD",
  "LINE_CHANNEL_SECRET",
  "LINE_CHANNEL_ACCESS_TOKEN",
  "S3_SECRET_ACCESS_KEY",
  "QDRANT_API_KEY",
];

const valueOf = (key) => process.env[key] || envFile[key] || "";
const hasValue = (key) => String(valueOf(key)).trim().length > 0;

const likelyUnsafe = (key, value) => {
  const v = String(value || "").trim();
  if (!v) return false;
  if (/^(changeme|replace_me|your_key_here|xxx+)$/i.test(v)) return true;
  if (key.endsWith("_PASSWORD") && v.length < 10) return true;
  if (/_API_KEY|TOKEN|SECRET/i.test(key) && v.length < 16) return true;
  return false;
};

const print = (level, message) => {
  console.log(`[${level}] ${message}`);
};

print("INFO", "Secret hygiene check (no secret values shown)");
print("INFO", "Source: Backend/.env, Backend/.env.local, runtime env");
console.log("");

let configuredCount = 0;
let unsafeCount = 0;

SECRET_KEYS.forEach((key) => {
  const value = valueOf(key);
  const configured = hasValue(key);
  if (configured) configuredCount += 1;
  const unsafe = likelyUnsafe(key, value);
  if (unsafe) unsafeCount += 1;
  const status = configured ? (unsafe ? "REVIEW" : "OK") : "MISSING";
  print(status, key);
});

console.log("");
print("SUMMARY", `configured secrets: ${configuredCount}/${SECRET_KEYS.length}`);
if (unsafeCount > 0) {
  print("WARN", `${unsafeCount} key(s) look weak/placeholder-like. Rotate and replace them.`);
}
print("NEXT", "Rotate keys previously shared in chats/logs and move production secrets to a secure store.");
