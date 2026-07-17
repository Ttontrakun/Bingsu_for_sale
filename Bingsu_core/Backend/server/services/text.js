import { TEXT_CHUNK_OVERLAP, TEXT_CHUNK_SIZE } from "../config.js";

export const normalizeMatchText = (text) =>
  (text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const chunkText = (text, chunkSize = 1200, overlap = 150) => {
  const normalized = (text || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const slice = normalized.slice(start, end).trim();
    if (slice) chunks.push(slice);
    if (end === normalized.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
};

const getSourceFiles = (sourceFiles) => {
  if (!sourceFiles) return [];
  if (Array.isArray(sourceFiles)) return sourceFiles;
  if (typeof sourceFiles === "string") {
    try {
      const parsed = JSON.parse(sourceFiles);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const buildFileBlocks = (documents) => {
  const fileBlocks = [];
  (documents || []).forEach((doc) => {
    const files = getSourceFiles(doc?.sourceFiles);
    files.forEach((file) => {
      const blocks = Array.isArray(file?.blocks) && file.blocks.length > 0
        ? file.blocks
        : chunkText(file?.text || "").map((text, index) => ({
            label: `Chunk ${index + 1}`,
            text,
          }));
      if (!blocks.length) return;
      fileBlocks.push({ docId: doc.id, fileName: file?.name, blocks });
    });
  });
  return fileBlocks;
};

const buildBigrams = (text) => {
  const normalized = normalizeMatchText(text);
  const pairs = new Set();
  if (normalized.length < 2) return pairs;
  for (let i = 0; i < normalized.length - 1; i += 1) {
    pairs.add(normalized.slice(i, i + 2));
  }
  return pairs;
};

const jaccardSimilarity = (a, b) => {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  a.forEach((item) => {
    if (b.has(item)) intersection += 1;
  });
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const isOverviewStyleQuery = (query) => {
  const normalized = normalizeMatchText(query);
  if (!normalized || normalized.length > 140) return false;
  const patterns = [
    /เอกสารเกี่ยวกับอะไร/,
    /เกี่ยวกับอะไร/,
    /สรุปให้/,
    /สรุป(ให้)?หน่อย/,
    /สรุปทั้งเอกสาร/,
    /ทั้งเอกสาร.*สรุป|สรุป.*ทั้งเอกสาร/,
    /มีอะไรบ้าง/,
    /เรื่องอะไร/,
    /เนื้อหาโดยรวม/,
    /โดยรวมเป็นยังไง/,
    /สรุปใจความ/,
  ];
  return patterns.some((re) => re.test(normalized));
};

const selectOverviewBlocks = (documents, maxPieces) => {
  const fileBlocks = buildFileBlocks(documents);
  const pieces = [];
  const seen = new Set();
  for (const file of fileBlocks) {
    // สำหรับคำถามสรุปภาพรวม ให้หยิบช่วงต้นของแต่ละไฟล์ก่อน
    const leading = (file.blocks || []).slice(0, 2);
    for (const block of leading) {
      const text = String(block?.text || "").trim();
      const normalized = normalizeMatchText(text);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      pieces.push(text);
      if (pieces.length >= maxPieces) return pieces;
    }
  }
  return pieces;
};

const getSearchTokens = (query) => {
  const raw = String(query || "");
  const normalized = normalizeMatchText(raw);
  const baseTokens = normalized
    .split(/[^\p{L}\p{N}%./-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const numericTokens = raw.match(/\d+(?:[.,]\d+)?%?/g) || [];
  const all = [...baseTokens, ...numericTokens.map((token) => token.replace(",", ".").trim())]
    .filter(Boolean);
  return Array.from(new Set(all));
};

const tokenWeight = (token) => (/^\d+(?:\.\d+)?%?$/.test(String(token)) ? 3 : 1);

const selectBestBlocks = (documents, query, maxPieces) => {
  if (isOverviewStyleQuery(query)) {
    const overviewPieces = selectOverviewBlocks(documents, maxPieces);
    if (overviewPieces.length > 0) return overviewPieces;
  }
  const tokens = getSearchTokens(query);
  if (!tokens.length) return [];
  const uniqueTokens = new Set(tokens);
  const fileBlocks = buildFileBlocks(documents);
  const scoredBlocks = [];
  fileBlocks.forEach((file) => {
    (file.blocks || []).forEach((block) => {
      const text = block?.text || "";
      const normalized = normalizeMatchText(text);
      if (!normalized) return;
      let score = 0;
      uniqueTokens.forEach((token) => {
        if (normalized.includes(token)) score += tokenWeight(token);
      });
      if (score > 0) {
        scoredBlocks.push({ text, score });
      }
    });
  });
  if (scoredBlocks.length > 0) {
    return scoredBlocks
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPieces)
      .map((item) => item.text);
  }

  const normalizedQuery = normalizeMatchText(query);
  if (!normalizedQuery || normalizedQuery.length < 2) return [];
  const queryBigrams = buildBigrams(normalizedQuery);
  if (!queryBigrams.size) return [];
  const fuzzyMatches = [];
  const scanLimit = 400;
  const scanTextLimit = 500;
  const minScore = 0.22;
  let scanned = 0;

  fileBlocks.forEach((file) => {
    if (scanned >= scanLimit) return;
    (file.blocks || []).forEach((block) => {
      if (scanned >= scanLimit) return;
      const text = block?.text || "";
      const normalized = normalizeMatchText(text);
      if (!normalized) return;
      const sample = normalized.slice(0, scanTextLimit);
      const score = jaccardSimilarity(queryBigrams, buildBigrams(sample));
      if (score >= minScore) {
        fuzzyMatches.push({ text, score });
      }
      scanned += 1;
    });
  });

  return fuzzyMatches
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPieces)
    .map((item) => item.text);
};

const findBestBlockIndex = (blocks, chunkTextValue) => {
  const normalizedChunk = normalizeMatchText(chunkTextValue);
  if (!normalizedChunk) return -1;
  const snippetSize = 180;
  const midStart = Math.max(0, Math.floor(normalizedChunk.length / 2 - snippetSize / 2));
  const snippets = [
    normalizedChunk.slice(0, snippetSize),
    normalizedChunk.slice(midStart, midStart + snippetSize),
    normalizedChunk.slice(Math.max(0, normalizedChunk.length - snippetSize)),
  ].filter(Boolean);

  let bestIndex = -1;
  let bestScore = 0;
  blocks.forEach((block, index) => {
    const normalizedBlock = normalizeMatchText(block?.text);
    if (!normalizedBlock) return;
    const matches = snippets.some(
      (snippet) =>
        normalizedBlock.includes(snippet) || snippet.includes(normalizedBlock),
    );
    if (!matches) return;
    const score = normalizedBlock.length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
};

export const buildContextPiecesWithNeighbors = (groundingChunks, documents, query, options = {}) => {
  const maxPieces = options.maxPieces ?? 10;
  const neighborWindow = options.neighborWindow ?? 1;
  const overviewQuery = isOverviewStyleQuery(query);
  const basePieces = (groundingChunks || [])
    .map((chunk) => chunk?.retrievedContext?.text)
    .filter(Boolean);

  if (basePieces.length === 0) {
    return selectBestBlocks(documents, query, maxPieces);
  }

  const neighborPieces = [];
  const seen = new Set();
  const addUnique = (value) => {
    const normalized = normalizeMatchText(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    neighborPieces.push(value);
  };

  basePieces.forEach((piece) => addUnique(piece));

  if (overviewQuery) {
    selectOverviewBlocks(documents, maxPieces).forEach((piece) => addUnique(piece));
  }

  if (neighborWindow <= 0) {
    return neighborPieces.slice(0, maxPieces);
  }

  const fileBlocks = buildFileBlocks(documents);
  basePieces.forEach((chunkTextValue) => {
    fileBlocks.forEach((file) => {
      const matchIndex = findBestBlockIndex(file.blocks, chunkTextValue);
      if (matchIndex === -1) return;
      for (let delta = -neighborWindow; delta <= neighborWindow; delta += 1) {
        if (delta === 0) continue;
        const neighbor = file.blocks[matchIndex + delta];
        if (neighbor?.text) addUnique(neighbor.text);
      }
    });
  });

  if (overviewQuery) {
    return neighborPieces.slice(0, maxPieces);
  }

  const scored = neighborPieces.map((piece) => {
    const normalizedPiece = normalizeMatchText(piece);
    const tokens = getSearchTokens(query);
    const uniqueTokens = new Set(tokens);
    let score = 0;
    uniqueTokens.forEach((token) => {
      if (normalizedPiece.includes(token)) score += tokenWeight(token);
    });
    return { piece, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPieces)
    .map((item) => item.piece);
};

/** ข้อความไม่เกินความยาวนี้ใช้ 1 chunk เดียว (ค่า default ให้แตกไวขึ้นสำหรับไฟล์ text ยาว) */
const SINGLE_CHUNK_MAX_LENGTH = Number(process.env.SINGLE_CHUNK_MAX_LENGTH || TEXT_CHUNK_SIZE);

const isMarkdownTableLine = (line) => /^\s*\|.*\|\s*$/.test(line);
const isTableSeparatorLine = (line) => /^\s*\|?[\s:|-]*-{3,}[\s:|-]*\|?\s*$/.test(line) && line.includes("-");

/** หั่นตารางใหญ่ตามแถว โดยใส่หัวตาราง (+เส้นคั่น) ซ้ำทุกส่วน เพื่อให้ทุก chunk ยังรู้ว่าคอลัมน์ไหนคืออะไร */
const splitTableByRows = (tableText, size) => {
  const rows = tableText.split("\n").filter((l) => l.trim());
  if (rows.length < 2) return [tableText];
  const hasSep = rows[1] && isTableSeparatorLine(rows[1]);
  const headerBlock = hasSep ? `${rows[0]}\n${rows[1]}` : rows[0];
  const bodyRows = rows.slice(hasSep ? 2 : 1);
  const parts = [];
  let current = [];
  let currentLen = headerBlock.length;
  for (const row of bodyRows) {
    if (current.length > 0 && currentLen + row.length + 1 > size) {
      parts.push([headerBlock, ...current].join("\n"));
      current = [];
      currentLen = headerBlock.length;
    }
    current.push(row);
    currentLen += row.length + 1;
  }
  if (current.length) parts.push([headerBlock, ...current].join("\n"));
  return parts.length ? parts : [tableText];
};

/** หั่นย่อหน้ายาวที่ขอบบรรทัด (ไม่ตัดกลางบรรทัด) เผื่อกรณีข้อความล้วนยาวมาก */
const splitLongText = (textBlock, size) => {
  if (textBlock.length <= size) return [textBlock];
  const out = [];
  let start = 0;
  while (start < textBlock.length) {
    let end = Math.min(start + size, textBlock.length);
    if (end < textBlock.length) {
      const nl = textBlock.lastIndexOf("\n", end);
      if (nl > start + 200) end = nl;
    }
    const slice = textBlock.slice(start, end).trim();
    if (slice) out.push(slice);
    start = end;
  }
  return out;
};

/**
 * แบ่งข้อความเป็น chunk แบบ "รู้จักโครงสร้าง":
 * - ไม่ตัดกลางตาราง Markdown (เก็บทั้งตารางไว้ด้วยกัน)
 * - ถ้าตารางใหญ่เกิน 1 chunk จะหั่นตามแถวและใส่หัวตารางซ้ำ
 * - จัดกลุ่มย่อหน้า/บล็อกให้พอดี chunk โดยตัดที่ขอบบล็อก ไม่ตัดกลางประโยค
 */
export const chunkTextForBlocks = (text, chunkSize = TEXT_CHUNK_SIZE) => {
  const normalized = (text || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= SINGLE_CHUNK_MAX_LENGTH) return [normalized];
  const size = Math.max(400, Number(chunkSize) || TEXT_CHUNK_SIZE);

  // 1) แยกเป็น segment: บล็อกตาราง (atomic) กับบล็อกข้อความ
  const lines = normalized.split("\n");
  const segments = [];
  let buffer = [];
  let bufferType = null;
  const flush = () => {
    if (!buffer.length) return;
    segments.push({ type: bufferType, text: buffer.join("\n").trim() });
    buffer = [];
    bufferType = null;
  };
  for (const line of lines) {
    const type = isMarkdownTableLine(line) ? "table" : "text";
    if (bufferType && type !== bufferType) flush();
    bufferType = type;
    buffer.push(line);
  }
  flush();

  // 2) กาง segment ที่ใหญ่เกิน chunk ออกเป็นหน่วยย่อย
  const units = [];
  for (const seg of segments) {
    if (!seg.text) continue;
    if (seg.type === "table" && seg.text.length > size) {
      splitTableByRows(seg.text, size).forEach((t) => units.push(t));
    } else if (seg.type === "text" && seg.text.length > size) {
      seg.text
        .split(/\n{2,}/)
        .flatMap((para) => splitLongText(para.trim(), size))
        .filter(Boolean)
        .forEach((t) => units.push(t));
    } else {
      units.push(seg.text);
    }
  }

  // 3) แพ็กหน่วยย่อยเข้า chunk แบบ greedy (ไม่หั่นกลางหน่วย)
  const chunks = [];
  let current = [];
  let currentLen = 0;
  const pushCurrent = () => {
    const joined = current.join("\n\n").trim();
    if (joined) chunks.push(joined);
    current = [];
    currentLen = 0;
  };
  // หัวข้อสั้นๆ (markdown heading) ที่ยืนเดี่ยว — ห้ามปล่อยค้างท้าย chunk เพราะตาราง/เนื้อหาถัดไปจะหลุดไปคนละ chunk
  const isHeadingUnit = (u) => {
    const t = String(u).trim();
    return /^#{1,6}\s/.test(t) && t.split("\n").length <= 2;
  };
  for (const unit of units) {
    const addLen = unit.length + 2;
    if (currentLen > 0 && currentLen + addLen > size) {
      // ย้ายหัวข้อที่ค้างท้าย chunk ไปเริ่ม chunk ใหม่พร้อมเนื้อหาถัดไป (ให้หัวข้ออยู่กับตาราง/เนื้อหาของมัน)
      const carry = [];
      while (current.length > 0 && isHeadingUnit(current[current.length - 1])) {
        carry.unshift(current.pop());
      }
      pushCurrent();
      if (carry.length > 0) {
        current = carry;
        currentLen = carry.reduce((sum, u) => sum + u.length + 2, 0);
      }
    }
    current.push(unit);
    currentLen += addLen;
  }
  pushCurrent();
  return chunks.length ? chunks : [normalized];
};

export const buildBlocksFromText = (text, labelPrefix) =>
  chunkTextForBlocks(text).map((chunk, index) => ({
    label: labelPrefix ? `${labelPrefix} • Chunk ${index + 1}` : `Chunk ${index + 1}`,
    text: chunk,
  }));

const sanitizeBlocks = (blocks) =>
  (Array.isArray(blocks) ? blocks : [])
    .map((block) => {
      if (!block || typeof block !== "object") return null;
      const text = String(block.text ?? block.content ?? "").trim();
      if (!text) return null;
      return { ...block, text };
    })
    .filter(Boolean);

const shouldAutoSplitExistingBlocks = (blocks, fileText) => {
  if (!Array.isArray(blocks) || blocks.length !== 1) return false;
  const only = blocks[0] || {};
  const label = String(only.label ?? "").trim().toLowerCase();
  const hasPageMeta = only.page !== undefined || only.page_num !== undefined || only.pageNumber !== undefined;
  const blockText = String(only.text ?? "").trim();
  const fullText = String(fileText || "").trim();
  const effectiveText = fullText || blockText;
  if (!effectiveText) return false;
  if (effectiveText.length <= SINGLE_CHUNK_MAX_LENGTH) return false;
  // Auto-split only plain free-text blocks to avoid breaking table/OCR structured blocks.
  const isPlainLabel = !label || label === "content" || /^chunk\s*\d+$/i.test(label);
  return isPlainLabel && !hasPageMeta;
};

export const ensureSourceFileBlocks = (sourceFiles) => {
  const files = Array.isArray(sourceFiles) ? sourceFiles : [];
  return files.map((file) => {
    const text = String(file?.text || "").trim();
    const existingBlocks = sanitizeBlocks(file?.blocks);

    if (existingBlocks.length > 0 && !shouldAutoSplitExistingBlocks(existingBlocks, text)) {
      return { ...file, text, blocks: existingBlocks };
    }

    const sourceText = text || existingBlocks.map((b) => String(b.text || "").trim()).filter(Boolean).join("\n\n").trim();
    return {
      ...file,
      text: sourceText,
      blocks: buildBlocksFromText(sourceText),
    };
  });
};

const SEARCH_STOPWORDS = new Set([
  "คือ", "ที่", "และ", "หรือ", "ของ", "ใน", "กับ", "ว่า", "อะไร", "อย่างไร", "ยังไง", "ทำไม",
  "the", "is", "are", "what", "how", "why", "a", "an", "to", "for", "of", "and", "or", "in", "on",
]);

const tokenizeQueryTerms = (query) => {
  const normalized = normalizeMatchText(query);
  if (!normalized) return [];
  const pieces = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter(Boolean);
  const terms = pieces.filter((t) => t.length >= 2 && !SEARCH_STOPWORDS.has(t));
  // เผื่อภาษาไทยที่ผู้ใช้พิมพ์ติดกันยาว ๆ ไม่มี space
  if (terms.length === 0 && normalized.length >= 6) {
    return [normalized.slice(0, Math.min(24, normalized.length))];
  }
  return Array.from(new Set(terms)).slice(0, 12);
};

/**
 * fallback เมื่อ vector search ไม่เจอ: ใช้ keyword match บนเอกสารที่เลือก
 * คืนค่าใน shape เดียวกับ groundingChunks จาก vector
 */
/**
 * Hybrid search: รวมผลจาก vector (เรียง/rerank มาแล้ว) กับผลจาก keyword match
 * โดยคงลำดับ vector ไว้ก่อน แล้วเติม chunk จาก keyword ที่ยังไม่ซ้ำ (dedupe ด้วย docId + ต้นข้อความ)
 */
export const mergeHybridChunks = (vectorChunks = [], keywordChunks = [], maxTotal = 12) => {
  const out = [];
  const seen = new Set();
  const keyOf = (c) => {
    const text = String(c?.retrievedContext?.text ?? c?.payload?.text ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    const docId = c?.payload?.docId ?? c?.retrievedContext?.docId ?? "";
    return `${docId}::${text}`;
  };
  for (const chunk of [...(Array.isArray(vectorChunks) ? vectorChunks : []), ...(Array.isArray(keywordChunks) ? keywordChunks : [])]) {
    if (!chunk) continue;
    const key = keyOf(chunk);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chunk);
    if (out.length >= Math.max(1, maxTotal)) break;
  }
  return out;
};

export const buildFallbackGroundingChunksFromDocuments = (query, documents, maxChunks = 3) => {
  const docs = Array.isArray(documents) ? documents : [];
  const terms = tokenizeQueryTerms(query);
  if (!docs.length || terms.length === 0) return [];

  const candidates = [];
  for (const doc of docs) {
    const files = ensureSourceFileBlocks(getSourceFiles(doc?.sourceFiles));
    for (const file of files) {
      const blocks = Array.isArray(file?.blocks) ? file.blocks : [];
      blocks.forEach((block, idx) => {
        const text = String(block?.text || "").trim();
        if (!text) return;
        const normalized = normalizeMatchText(text);
        let hitCount = 0;
        const hitTerms = [];
        for (const term of terms) {
          if (normalized.includes(term)) {
            hitCount += 1;
            hitTerms.push(term);
          }
        }
        if (hitCount === 0) return;
        candidates.push({
          docId: doc?.id,
          fileName: file?.name || doc?.displayName || "เอกสาร",
          blockIndex: idx,
          text,
          hitCount,
          hitTerms,
          score: hitCount / Math.max(1, terms.length),
        });
      });
    }
  }

  const unique = new Map();
  candidates
    .sort((a, b) => (b.hitCount - a.hitCount) || (b.text.length - a.text.length))
    .forEach((item) => {
      const key = `${item.docId || "unknown"}::${item.blockIndex}`;
      if (!unique.has(key)) unique.set(key, item);
    });

  return Array.from(unique.values())
    .slice(0, Math.max(1, maxChunks))
    .map((item) => ({
      score: item.score,
      retrievedContext: {
        text: item.text,
        title: item.fileName,
        docId: item.docId,
      },
      payload: {
        docId: item.docId,
        fileName: item.fileName,
        chunkIndex: item.blockIndex,
        label: `keyword match: ${item.hitTerms.slice(0, 3).join(", ") || "-"}`,
        text: item.text,
      },
    }));
};

/** ดึงข้อความจากเอกสารเมื่อ vector search ไม่ได้ chunk (embedding ยังไม่เสร็จหรือ query ไม่ match) — ใช้ตอบคำถามแบบ เอกสารเกี่ยวกับอะไร / สรุปให้ */
export const getFallbackContextFromDocuments = (documents, maxCharsTotal = 12000) => {
  const docs = Array.isArray(documents) ? documents : [];
  const parts = [];
  let total = 0;
  for (const doc of docs) {
    // บางเอกสารอาจมีแค่ file.text แต่ยังไม่มี file.blocks (เช่น เอกสารเก่าหรือ data ที่มาจากช่องทางอื่น)
    // ทำให้ fallback กลายเป็นค่าว่างและตอบว่า "ไม่มีในฐานข้อมูล" ทั้งที่มีข้อความอยู่จริง
    const files = ensureSourceFileBlocks(getSourceFiles(doc?.sourceFiles));
    for (const file of files) {
      const blocks = Array.isArray(file?.blocks) ? file.blocks : [];
      const name = file?.name || "เอกสาร";
      let fileText = blocks.map((b) => (b?.text ?? "").trim()).filter(Boolean).join("\n\n");
      if (fileText && total < maxCharsTotal) {
        const take = Math.min(fileText.length, maxCharsTotal - total);
        parts.push(`[${name}]\n${fileText.slice(0, take)}${take < fileText.length ? "…" : ""}`);
        total += take;
      }
      if (total >= maxCharsTotal) break;
    }
    if (total >= maxCharsTotal) break;
  }
  return parts.join("\n\n---\n\n");
};

/** เลือกว่าจะค้นหา vector จาก doc ไหน — ถ้าบอทมีหลาย knowledge ให้ค้นเพียงเอกสารของแชทนี้ */
export const resolveRagDocumentIds = (botDocIds, conversationDocumentId) => {
  const primary =
    conversationDocumentId != null && conversationDocumentId !== ""
      ? String(conversationDocumentId)
      : "";
  const ids = Array.from(new Set((botDocIds || []).filter(Boolean).map(String)));
  if (!ids.length) return primary ? [primary] : [];
  if (ids.length === 1) return ids;
  if (primary && ids.includes(primary)) return [primary];
  return ids;
};

/** Context ที่ส่งเข้าโมเดล/fallback — ให้สอดคล้องกับขอบเขตการค้นหา */
export const filterContextDocsByIds = (contextDocuments, searchDocIds) => {
  const allowed = new Set((searchDocIds || []).filter(Boolean).map(String));
  if (!allowed.size) return contextDocuments || [];
  const filtered = (contextDocuments || []).filter((d) => d?.id != null && allowed.has(String(d.id)));
  return filtered.length > 0 ? filtered : contextDocuments || [];
};

const stripSummaryMarks = (s) =>
  String(s || "")
    .replace(/^[*#\s`_\-－]+|[*#\s`_\-－]+$/g, "")
    .trim();

/** ตัดหัวข้อ "สรุปสั้นๆ" ถ้าคำตอบหลักสั้นพอ หรือย่อหน้าสรุปซ้ำกับเนื้อหาหลักโดยรวม */
export const stripRedundantShortSummary = (reply) => {
  const text = String(reply ?? "").trim();
  if (!text) return text;
  const marker =
    /\r?\n\s*(?:[#`|_]{0,4})?\s*\*{0,2}\s*สรุปสั้นๆ\s*\*{0,2}\s*[：:\.]?\s*(?:<br\s*\/?>|\s)*\r?\n/im;
  const m = text.match(marker);
  if (!m || m.index == null) return text;
  const main = text.slice(0, m.index).trim();
  const summaryBlock = text.slice(m.index + m[0].length).trim();
  if (!main || !summaryBlock) return text;
  const normalize = (s) =>
    s
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 800);
  const mainNorm = normalize(main);
  const firstSummaryLineRaw = summaryBlock.split(/\r?\n+/).find((l) => stripSummaryMarks(l)) || "";
  const summaryHead = normalize(stripSummaryMarks(firstSummaryLineRaw));
  const shortReply =
    main.length < 550 ||
    mainNorm.split(/\s+/).filter(Boolean).length < 110 ||
    text.split(/\r?\n/).filter((l) => l.trim()).length <= 8;
  const duplicated =
    !summaryHead ||
    summaryHead.length < 14 ||
    mainNorm.includes(summaryHead) ||
    summaryHead.includes(mainNorm.slice(0, Math.min(240, mainNorm.length)));
  if (shortReply || duplicated) return main;
  return text;
};
