import { GoogleGenAI } from "@google/genai";
import { embeddingApiKey, embeddingBaseUrl, embeddingBatchSize, embeddingModel, embeddingProvider, embeddingTimeoutMs } from "../config.js";
import { Agent } from "undici";

const embeddingConnectTimeoutMs = Number(process.env.EMBEDDING_CONNECT_TIMEOUT_MS || embeddingTimeoutMs || 30000);
const embeddingDispatcher = new Agent({
  connectTimeout: Number.isFinite(embeddingConnectTimeoutMs) ? embeddingConnectTimeoutMs : 30000,
});

let geminiClient;
const getGeminiClient = () => {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
};

const withTimeout = async (promise, ms, label) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out.`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
};

const normalizeProvider = (value) => String(value || "").trim().toLowerCase();

const getOpenAiEmbeddingClient = () => {
  if (!embeddingApiKey) return null;
  return {
    baseUrl: embeddingBaseUrl || "https://api.openai.com/v1",
    apiKey: embeddingApiKey,
    model: embeddingModel || "text-embedding-3-large",
  };
};

const embedTextsOpenAi = async (texts) => {
  const client = getOpenAiEmbeddingClient();
  if (!client) {
    throw new Error("Missing EMBEDDING_API_KEY in .env.local or .env.");
  }

  const inputs = Array.isArray(texts) ? texts : [];
  if (!inputs.length) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Number.isFinite(embeddingTimeoutMs) ? embeddingTimeoutMs : 10000);
  try {
    const response = await fetch(`${client.baseUrl}/embeddings`, {
      method: "POST",
      dispatcher: embeddingDispatcher,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${client.apiKey}`,
      },
      body: JSON.stringify({ model: client.model, input: inputs, encoding_format: "float" }),
      signal: controller.signal,
    });

    const json = await response.json().catch(() => null);
    if (!response.ok) {
      const message = json?.error?.message || JSON.stringify(json) || `HTTP ${response.status}`;
      const err = new Error(message);
      err.status = response.status;
      throw err;
    }

    const data = Array.isArray(json?.data) ? json.data : [];
    if (data.length !== inputs.length) {
      throw new Error("Embedding response size mismatch");
    }
    return data.map((item) => (Array.isArray(item?.embedding) ? item.embedding.map((v) => Number(v)) : []));
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Embedding timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const embedTextsGemini = async (texts) => {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error("Missing GEMINI_API_KEY in .env.local or .env.");
  }
  const inputs = Array.isArray(texts) ? texts : [];
  if (!inputs.length) return [];

  const batchSize = Number.isFinite(embeddingBatchSize) ? embeddingBatchSize : 32;
  const vectors = [];
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    const response = await withTimeout(
      ai.models.embedContent({
        model: embeddingModel,
        contents: batch,
      }),
      Number.isFinite(embeddingTimeoutMs) ? embeddingTimeoutMs : 10000,
      "Embedding",
    );
    const embeddings = response.embeddings || [];
    if (embeddings.length !== batch.length) {
      throw new Error("Embedding response size mismatch");
    }
    embeddings.forEach((item) => {
      const values = item?.values || [];
      const arrayValues = Array.isArray(values) ? values : Array.from(values);
      vectors.push(arrayValues.map((value) => Number(value)));
    });
  }
  return vectors;
};

export const embedTexts = async (texts) => {
  const provider = normalizeProvider(embeddingProvider);
  if (provider === "openai") {
    return embedTextsOpenAi(texts);
  }
  if (provider === "gemini") {
    return embedTextsGemini(texts);
  }
  throw new Error(`Unsupported EMBEDDING_PROVIDER="${embeddingProvider}". Use "openai" or "gemini".`);
};
