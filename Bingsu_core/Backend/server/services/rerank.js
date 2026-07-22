import {
  ragExternalRerankApiKey,
  ragExternalRerankEnabled,
  ragExternalRerankModel,
  ragExternalRerankTimeoutMs,
  ragExternalRerankUrl,
} from "../config.js";

const defaultRerankUrl = "https://aigateway.ntictsolution.com/v1/rerank";

const getEndpointUrl = () => (ragExternalRerankUrl || defaultRerankUrl).replace(/\/+$/, "");

const normalizeScore = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const parseRerankItems = (payload) => {
  if (!payload || typeof payload !== "object") return [];
  const candidates = [
    payload.results,
    payload.data,
    payload.ranked_documents,
    payload.reranked,
  ];
  const list = candidates.find((x) => Array.isArray(x));
  if (!list) return [];
  return list
    .map((item) => ({
      index: Number(item?.index),
      score: normalizeScore(
        item?.relevance_score
        ?? item?.score
        ?? item?.relevanceScore
        ?? item?.similarity
        ?? 0,
      ),
    }))
    .filter((item) => Number.isInteger(item.index) && item.index >= 0);
};

export const rerankRetrievedChunks = async (query, chunks, topK) => {
  if (!ragExternalRerankEnabled) return null;
  if (!ragExternalRerankApiKey || !ragExternalRerankModel) return null;
  const list = Array.isArray(chunks) ? chunks : [];
  if (!query || !list.length) return null;

  const documents = list.map((item) => String(item?.retrievedContext?.text || item?.payload?.text || ""));
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Number(ragExternalRerankTimeoutMs || 10000));
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(getEndpointUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ragExternalRerankApiKey}`,
      },
      body: JSON.stringify({
        model: ragExternalRerankModel,
        query: String(query),
        documents,
        top_n: Math.max(1, Math.min(Number(topK) || list.length, list.length)),
        return_documents: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Reranker request failed: ${response.status}`);
    }

    const payload = await response.json();
    const reranked = parseRerankItems(payload);
    if (!reranked.length) return null;

    const deduped = [];
    const seen = new Set();
    reranked.forEach(({ index, score }) => {
      if (index < 0 || index >= list.length) return;
      if (seen.has(index)) return;
      seen.add(index);
      deduped.push({ item: list[index], score });
    });
    if (!deduped.length) return null;

    return deduped
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(Number(topK) || deduped.length, deduped.length)))
      // แนบคะแนน rerank ไว้กับ chunk เพื่อให้ชั้นถัดไป (กรองอ้างอิง) ใช้แยก "เกี่ยว/ไม่เกี่ยว" ได้ขาดกว่า vector score
      .map(({ item, score }) => ({ ...item, rerankScore: score }));
  } catch (error) {
    if (error?.name === "AbortError") {
      console.warn("[RAG] external reranker timed out; fallback to local rerank.");
      return null;
    }
    console.warn("[RAG] external reranker failed; fallback to local rerank.", error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};
