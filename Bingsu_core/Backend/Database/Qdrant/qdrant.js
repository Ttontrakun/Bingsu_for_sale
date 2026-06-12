import {
  qdrantApiKey,
  qdrantCollectionName,
  qdrantDistance,
  qdrantTopK,
  qdrantUrl,
} from "../../Service/Rag/config.js";

const headers = () => {
  const base = { "Content-Type": "application/json" };
  if (qdrantApiKey) {
    return { ...base, "api-key": qdrantApiKey };
  }
  return base;
};

const qdrantFetch = async (path, options = {}) => {
  const url = `${qdrantUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers(),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Qdrant request failed: ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
};

let collectionReady = false;
let collectionSize = null;

export const ensureCollection = async (vectorSize) => {
  if (collectionReady && collectionSize === vectorSize) return;
  try {
    const existing = await qdrantFetch(`/collections/${qdrantCollectionName}`, { method: "GET" });
    const size = existing?.result?.config?.params?.vectors?.size;
    if (size && size !== vectorSize) {
      throw new Error(`Qdrant collection size mismatch (expected ${vectorSize}, got ${size})`);
    }
    collectionReady = true;
    collectionSize = size || vectorSize;
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("404")
      || message.includes("Not found")
      || message.includes("doesn't exist")
    ) {
      await qdrantFetch(`/collections/${qdrantCollectionName}`, {
        method: "PUT",
        body: JSON.stringify({
          vectors: {
            size: vectorSize,
            distance: qdrantDistance,
          },
        }),
      });
      collectionReady = true;
      collectionSize = vectorSize;
      return;
    }
    throw error;
  }
};

export const upsertPoints = async (points) => {
  if (!points.length) return;
  await qdrantFetch(`/collections/${qdrantCollectionName}/points?wait=true`, {
    method: "PUT",
    body: JSON.stringify({ points }),
  });
};

export const deleteDocumentVectors = async (documentId) => {
  if (!documentId) return;
  await qdrantFetch(`/collections/${qdrantCollectionName}/points/delete?wait=true`, {
    method: "POST",
    body: JSON.stringify({
      filter: {
        must: [
          {
            key: "docId",
            match: { value: documentId },
          },
        ],
      },
    }),
  });
};

export const searchQdrant = async (vector, { docIds = [], limit } = {}) => {
  if (!vector || !vector.length) return [];
  const must = [];
  if (docIds.length) {
    must.push({
      key: "docId",
      match: { any: docIds },
    });
  }

  const response = await qdrantFetch(`/collections/${qdrantCollectionName}/points/search`, {
    method: "POST",
    body: JSON.stringify({
      vector,
      limit: limit || qdrantTopK,
      with_payload: true,
      filter: must.length ? { must } : undefined,
    }),
  });

  return response?.result || [];
};

