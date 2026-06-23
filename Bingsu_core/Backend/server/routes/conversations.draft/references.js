/**
 * Draft extraction from routes/conversations.js
 * NOTE: not wired yet.
 */
export const buildReferences = (groundingChunks, contextDocuments, primaryDocument) => {
  const docMap = new Map((contextDocuments || []).map((d) => [d?.id, d?.displayName || d?.fileName || "เอกสาร"]));
  const refsByDoc = new Map();

  const normalizeQuote = (input) => {
    const raw = String(input || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    const stripped = raw
      .replace(/^(?:sheet|tab)\s*[^|]*\|\s*/i, "")
      .replace(/^(?:row|line|column)\s*[_\d\s-]*:?\s*/i, "");
    return (stripped || raw).slice(0, 220).trim();
  };

  const buildLineHint = ({ label, chunkIndex, textRaw }) => {
    const rowMatch = label.match(/row\s+(\d+)/i) || textRaw.match(/\brow\s+(\d+)\b/i);
    const lineMatch =
      label.match(/line\s+(\d+)(?:\s*[-–]\s*(\d+))?/i) ||
      textRaw.match(/\bline\s+(\d+)(?:\s*[-–]\s*(\d+))?\b/i);
    const pageMatch = label.match(/page\s+(\d+)/i) || textRaw.match(/\bpage\s+(\d+)\b/i);
    if (rowMatch) return { lineHint: `แถว ${rowMatch[1]}`, page: null };
    if (lineMatch) return { lineHint: lineMatch[2] ? `บรรทัด ${lineMatch[1]}-${lineMatch[2]}` : `บรรทัด ${lineMatch[1]}`, page: null };
    if (pageMatch) return { lineHint: `หน้า ${pageMatch[1]}`, page: Number(pageMatch[1]) };
    if (chunkIndex !== null) return { lineHint: `ช่วงที่ ${chunkIndex + 1}`, page: null };
    return { lineHint: "", page: null };
  };

  const parsePosition = (chunk) => {
    const label = String(chunk?.payload?.label || "").trim();
    const rawChunkIndex = chunk?.payload?.chunkIndex;
    const chunkIndex = Number.isFinite(Number(rawChunkIndex)) ? Number(rawChunkIndex) : null;
    const textRaw = String(chunk?.retrievedContext?.text ?? chunk?.payload?.text ?? "").trim();
    const { lineHint, page } = buildLineHint({ label, chunkIndex, textRaw });
    const quote = normalizeQuote(textRaw);
    const score = Number.isFinite(Number(chunk?.score)) ? Number(chunk.score) : 0;
    return { chunkIndex, label, lineHint, page, quote, score };
  };

  const refs = [];
  for (const chunk of groundingChunks || []) {
    const docId = chunk?.retrievedContext?.docId ?? chunk?.payload?.docId;
    const title = chunk?.retrievedContext?.title ?? chunk?.payload?.fileName;
    if (!docId) continue;

    if (!refsByDoc.has(docId)) {
      const next = {
        docId,
        displayName: docMap.get(docId) || title || "เอกสาร",
        positions: [],
        bestScore: Number.NEGATIVE_INFINITY,
      };
      refsByDoc.set(docId, next);
      refs.push(next);
    }

    const ref = refsByDoc.get(docId);
    const position = parsePosition(chunk);
    ref.bestScore = Math.max(ref.bestScore, position.score || 0);
    const positionKey = `${position.chunkIndex ?? "n"}::${position.label || ""}::${position.lineHint || ""}`;
    if (!ref.positions.some((item) => `${item.chunkIndex ?? "n"}::${item.label || ""}::${item.lineHint || ""}` === positionKey)) {
      ref.positions.push(position);
    }
    ref.positions.sort((a, b) => (b.score || 0) - (a.score || 0));
    if (ref.positions.length > 3) {
      ref.positions = ref.positions.slice(0, 3);
    }
  }

  if (refs.length === 0) {
    const pushFallbackDoc = (doc) => {
      const docId = doc?.id;
      if (!docId || refsByDoc.has(docId)) return;
      const ref = {
        docId,
        displayName: docMap.get(docId) || doc?.displayName || doc?.fileName || "เอกสาร",
        positions: [],
        bestScore: Number.NEGATIVE_INFINITY,
      };
      refsByDoc.set(docId, ref);
      refs.push(ref);
    };
    if (primaryDocument?.id) pushFallbackDoc(primaryDocument);
    else if ((contextDocuments || []).length === 1) pushFallbackDoc(contextDocuments[0]);
  }

  return refs
    .sort((a, b) => (b.bestScore || Number.NEGATIVE_INFINITY) - (a.bestScore || Number.NEGATIVE_INFINITY))
    .map((ref) => ({ docId: ref.docId, displayName: ref.displayName, positions: ref.positions }));
};
