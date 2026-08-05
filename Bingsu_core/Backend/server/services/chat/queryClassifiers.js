/**
 * ตัวจำแนกประเภทคำถาม (query classifiers) + text utils ล้วน ๆ — ไม่มี side effect / ไม่แตะ DB
 * ย้ายมาจาก routes/conversations.js (refactor แยกไฟล์ ไม่เปลี่ยนพฤติกรรม)
 */

export const normalizeText = (s) => String(s || "").trim().toLowerCase();

export const AUTHORITY_ROLE_MAP = [
  { abbr: "ผจก.", full: "ผู้จัดการ", re: /(ผจก\.?|ผู้จัดการ)/i },
  { abbr: "ชจญ.", full: "ผู้ช่วยกรรมการผู้จัดการใหญ่", re: /(ชจญ\.?|ชจรย\.?|ผู้ช่วยกรรมการผู้จัดการใหญ่)/i },
  { abbr: "รจญ.", full: "รองกรรมการผู้จัดการใหญ่", re: /(รจญ\.?|รองกรรมการผู้จัดการใหญ่)/i },
  { abbr: "กจญ.", full: "กรรมการผู้จัดการใหญ่", re: /(กจญ\.?|กรรมการผู้จัดการใหญ่)/i },
];

export const formatAuthorityRole = (value) => {
  const text = String(value || "").trim();
  if (!text) return text;
  const match = AUTHORITY_ROLE_MAP.find((entry) => entry.re.test(text));
  if (!match) return text;
  return `${match.abbr} (${match.full})`;
};

export const isAuthorityDecisionQuery = (message) => {
  const m = normalizeText(message);
  if (!m) return false;
  return /(ใครอนุมัติ|ผู้อนุมัติ|ใครมีอำนาจ|มีอำนาจอนุมัติ|อำนาจอนุมัติ|อำนาจของท่าน|ผู้มีอำนาจ|ท่านใด|ใครรับผิดชอบ|อนุมัติ.*ใคร|ใคร.*อนุมัติ|อำนาจส่วนลด|อนุมัติอัตรา|ส่วนลดเฉพาะราย)/.test(m);
};

export const isAuthorityDetailFollowUpQuery = (message) => {
  const m = normalizeText(message);
  if (!m) return false;
  return /(จากคำตอบก่อนหน้า|อธิบายเพิ่มเติม|ดูรายละเอียดเพิ่มเติม|อธิบายรายละเอียด|ยกตัวอย่าง|แบบเป็นข้อ|ขั้นตอน|เงื่อนไข|เข้าใจง่ายขึ้น)/.test(m);
};

export const isNtCorporateOverFloorQuery = (m) =>
  /(nt\s*corporate|ลูกค้าองค์กร|ส่วนลดเฉพาะรายสำหรับลูกค้าองค์กร)/.test(m)
  && /(floor\s*price|floorprice|เกิน\s*floor|เกินราคาขั้นต่ำ|ต่ำกว่าราคาขั้นต่ำ|ฟลอร์\s*ไพรซ์)/.test(m);

export const isDarkFiberOver50ToFloorQuery = (m) =>
  /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
  && /(มากกว่า|เกิน|มากกว่าร้อยละ)/.test(m)
  && /(50|ร้อยละ\s*50)/.test(m)
  && /(floor\s*price|floorprice|ไม่เกิน\s*floor|ฟลอร์\s*ไพรซ์)/.test(m);

export const isTrial45DaysApprovalQuery = (m) =>
  /(ทดลองใช้|ทดลองบริการ|ทดลองใช้บริการ)/.test(m)
  && /(45\s*วัน|สี่สิบห้า\s*วัน)/.test(m)
  && /(อำนาจ|ระดับ|อนุมัติ|ใคร)/.test(m);

/**
 * ตรวจว่าข้อความน่าจะมี "หลายคำถาม/หลายส่วน" หรือไม่ (เช่น ถามคำถามฟิก + พ่วงอีกคำถาม)
 * ใช้เพื่อไม่ให้ระบบตอบแค่คำตอบฟิกแล้วตัดจบ — ถ้าเป็น multi ให้ส่งต่อให้ LLM ตอบครบทุกส่วน
 */
export const hasMultipleQuestions = (message) => {
  const m = String(message || "").trim();
  if (!m) return false;
  // เครื่องหมายคำถามตั้งแต่ 2 ตัวขึ้นไป = หลายคำถามชัดเจน
  const qMarks = (m.match(/[?？]/g) || []).length;
  if (qMarks >= 2) return true;
  // รายการที่ขึ้นต้นด้วยเลขตั้งแต่ 2 ข้อ เช่น "1. ... 2. ... 3. ..." = หลายคำถามชัดเจน (สอดคล้องกับตัวแยกใน rag.js)
  const numberedItems = (m.match(/(?:^|\s)\d{1,2}[.)]+\s+\S/g) || []).length;
  if (numberedItems >= 2) return true;
  // นับ "คำบ่งชี้คำถาม" และตัวเชื่อมที่มักคั่นหลายประเด็น
  const questionCueCount = (m.match(/(เท่าไหร่|เท่าไร|กี่|อะไร|ยังไง|อย่างไร|ทำไม|ที่ไหน|ใคร|เมื่อไหร่|ไหม|มั้ย|หรือไม่|ขั้นต่ำ|สูงสุด|นานสุด)/g) || []).length;
  const conjCount = (m.match(/(และ|กับ|อีกอย่าง|อีกข้อ|อีกคำถาม|รวมถึง|พร้อมทั้ง|แล้วก็|และก็|ส่วน)/g) || []).length;
  if (questionCueCount >= 2 && conjCount >= 1) return true;
  return false;
};

export const isLikelyFollowUp = (message) => {
  const m = normalizeText(message);
  if (!m) return false;
  // คำถามสรุปภาพรวมมักเป็นคำถามใหม่ ไม่ควรดึง history เก่ามากดทับคำตอบ
  if (/สรุปทั้งหมด|สรุปทั้งเอกสาร|เอกสารเกี่ยวกับอะไร|เนื้อหาโดยรวม|โดยรวมเป็นยังไง/.test(m)) {
    return false;
  }
  // คำขอ "อธิบายเพิ่ม/ดูรายละเอียด/ยกตัวอย่าง/แบบเป็นข้อ/จากคำตอบก่อนหน้า" ถือเป็น follow-up เสมอ
  if (isAuthorityDetailFollowUpQuery(message)) return true;
  // คำถามต่อเนื่องทั่วไปที่อ้างอิงคำถามเดิม/ขอข้อมูลเพิ่ม
  if (/(จากคำถามเดิม|จากที่ถาม|ที่ถามไป|เพิ่มเติม|รายละเอียดเพิ่ม|ขยายความ|แล้วถ้า|แล้วกรณี|ถ้าเกิน|กรณีที่เกิน|แล้วล่ะ|ต่อจาก)/.test(m)) return true;
  // คำถามต่อเนื่องเชิงเงื่อนไข/ตัวเลขสั้นๆ เช่น "ถ้า 70 วันได้มั้ย", "50 วันล่ะ", "แล้ว 30 วัน"
  if (/^(ถ้า|แล้ว|งั้น)\s*/.test(m) && m.length <= 40) return true;
  if (/(ล่ะ|ละ)\s*\??$/.test(m) && m.length <= 30) return true;
  const isShortConditional = m.length <= 30
    && /\d/.test(m)
    && /(ได้มั้ย|ได้ไหม|ได้ป่าว|ได้รึ|ล่ะ|ละ|มั้ย|ไหม|หรือไม่|รึเปล่า)/.test(m);
  if (isShortConditional) return true;
  // short / referential messages are often follow-ups
  if (m.length <= 14) {
    if (/(แล้ว|ต่อ|อีก|เพิ่ม|ทำไม|ยังไง|ยังงี้|อันไหน|อันนี้|ตรงนี้|เมื่อกี้|ข้างบน|ที่บอก|ตามนั้น)/.test(m)) return true;
  }
  const patterns = [
    /อธิบายเพิ่ม/,
    /ขยายความ/,
    /แล้วล่ะ/,
    /ต่อเลย/,
    /จากเมื่อกี้/,
    /เมื่อกี้/,
    /ตามที่บอก/,
    /อันนี้/,
    /ตรงนี้/,
    /ข้างบน/,
    /สรุปอีกที/,
    /หมายถึง/,
    /แบบไหนดีกว่า/,
    /อันไหนดีกว่า/,
    /ต่างกันยังไง/,
    /ดีกว่ายังไง/,
    /แบบไหนเร็วสุด/,
    /อันไหนเร็วสุด/,
    /ตัวไหนเร็วสุด/,
    /ไหนเร็วสุด/,
    /เร็วสุด/,
    /ช้าที่สุด/,
    /which\s+is\s+better/,
    /what'?s\s+better/,
    /which\s+is\s+fastest/,
    /fastest/,
  ];
  if (patterns.some((re) => re.test(m))) return true;

  // Generic follow-up heuristic:
  // ถ้าเป็นคำถามสั้นเชิงเปรียบเทียบ/อ้างอิง (แต่ไม่ self-contained) ให้ถือเป็นคำถามต่อเนื่อง
  // เพื่อลดการต้องเพิ่ม pattern ทีละเคส
  const hasReferentialCue = /(แบบไหน|อันไหน|ตัวไหน|ไหน|แบบนี้|แบบนั้น|อันนี้|อันนั้น|ตัวนี้|ตัวนั้น)/.test(m);
  const hasComparativeCue = /(ดีกว่า|เร็วกว่า|เร็วสุด|ช้าสุด|คุ้มกว่า|เหมาะกว่า|ต่างกัน|แตกต่าง|ควร|ไม่ควร|แนะนำ|เลือกอันไหนดี|เลือกแบบไหนดี)/.test(m);
  const hasStandaloneContext = /(ระหว่าง|เทียบ|vs|versus|กับ)/.test(m);
  const isShortQuestion = m.length <= 36;
  if (isShortQuestion && (hasReferentialCue || hasComparativeCue) && !hasStandaloneContext) {
    return true;
  }

  return false;
};

export const SEARCH_STOPWORDS = new Set([
  "คือ", "ที่", "และ", "หรือ", "ของ", "ใน", "กับ", "ว่า", "อะไร", "อย่างไร", "ยังไง", "ทำไม", "ไหม", "มั้ย",
  "the", "is", "are", "what", "how", "why", "a", "an", "to", "for", "of", "and", "or", "in", "on",
]);

export const extractEvidenceTokens = (message) => {
  const raw = String(message || "");
  const normalized = raw.toLowerCase();
  const words = normalized
    .split(/[^\p{L}\p{N}%./-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !SEARCH_STOPWORDS.has(token));
  const numeric = raw.match(/\d+(?:[.,]\d+)?%?/g) || [];
  const unique = new Set(
    [...words, ...numeric.map((token) => token.replace(",", ".").trim())]
      .filter(Boolean),
  );
  return Array.from(unique).slice(0, 16);
};

export const isPricingIntent = (message) => {
  const normalized = String(message || "").toLowerCase();
  return /(ราคา|ค่าบริการ|แพ็กเกจ|โปร|โปรโมชั่น|เท่าไหร่|กี่บาท|เดือนนี้|ต่อเดือน|\/เดือน)/.test(normalized);
};

export const isConsumerInternetPriceQuery = (message) => {
  const normalized = normalizeText(message);
  return /(โปรเน็ตบ้าน|เน็ตบ้าน|internet home|home internet|fiber home)/.test(normalized);
};

export const isUndergroundDarkFiberPriceQuery = (message) => {
  const normalized = normalizeText(message);
  return /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(normalized)
    && /(ใต้ดิน|ร้อยสายใต้ดิน)/.test(normalized)
    && /(ราคา|ค่าบริการ|เท่าไหร่|ต่อเดือน|\/เดือน)/.test(normalized);
};

export const isSystemCapabilityQuery = (message) => {
  const m = normalizeText(message);
  if (!m) return false;
  return /(มี(ข้อมูล|เอกสาร|ความรู้).*(อะไรบ้าง|บ้าง)|มีเอกสารอะไร.*(ระบบ|ถามได้)|ระบบมีอะไรบ้าง|ถามอะไรได้บ้าง|มีเรื่องอะไรให้ถาม|ช่วยอะไรได้บ้าง|มีหัวข้ออะไรบ้าง)/.test(m);
};

export const isUnintelligibleQuery = (message) => {
  const raw = String(message || "");
  const trimmed = raw.trim();
  if (!trimmed) return true;
  // ถ้าเพี้ยนแค่นิดเดียว ให้ตอบได้ตามปกติ (ไม่บล็อก)
  if (trimmed.length <= 120) {
    const minorNoise = (trimmed.match(/[?\uFF1F\u061F�]/g) || []).length;
    if (minorNoise <= 3) return false;
  }
  // รองรับเครื่องหมายคำถามหลายแบบ (ASCII ?, fullwidth ？, Arabic ؟)
  const questionMarkCount = (trimmed.match(/[?\uFF1F\u061F]/g) || []).length;
  const questionMarkBursts = trimmed.match(/[?\uFF1F\u061F]{4,}/g) || [];
  const replacementCharCount = (trimmed.match(/�/g) || []).length;
  const weirdSymbolBursts = trimmed.match(/[^\p{L}\p{N}\s.,!?%:/()\-]{4,}/gu) || [];
  const meaningfulChars = (trimmed.match(/[\p{L}\p{N}]/gu) || []).length;
  const unknownSymbolCount = (trimmed.match(/[^\p{L}\p{N}\s.,!?%:/()\-]/gu) || []).length;
  const noiseRatio = (questionMarkCount + replacementCharCount + unknownSymbolCount) / Math.max(1, trimmed.length);
  // ยอมให้มีสะกดผิด/พิมพ์ตกเล็กน้อยได้: จะถือว่าอ่านไม่ออกเมื่อ noise หนักจริงเท่านั้น
  // กรณีคลาสสิก: เครื่องหมาย ? เยอะมาก + แทบไม่มีตัวอักษรที่มีความหมาย
  if (questionMarkCount >= 14 && meaningfulChars <= 6) return true;
  // มี replacement char มักเป็น encoding พัง: ให้เข้มเฉพาะเมื่อยาวพอและสัดส่วนสูง
  if (replacementCharCount >= 4 && (replacementCharCount / Math.max(1, trimmed.length)) >= 0.2) return true;
  // กรณีข้อความแบ่งเป็นก้อน ???? หลายช่วง แม้มี keyword อังกฤษคั่นอยู่เล็กน้อย
  if (questionMarkBursts.length >= 2 && questionMarkCount >= 10) return true;
  // อักขระแปลกอื่น ๆ ถ้าเป็นก้อนยาวหลายช่วง ก็ถือว่าอ่านไม่ออกเหมือนกัน
  if (weirdSymbolBursts.length >= 2 && unknownSymbolCount >= 10) return true;
  // ข้อความแทบเป็น noise ทั้งบรรทัด
  if (trimmed.length >= 20 && noiseRatio >= 0.55 && meaningfulChars <= 8) return true;
  // ข้อความสั้นแต่ไม่มีสาระพอให้อ่านความหมาย
  if (trimmed.length >= 10 && meaningfulChars <= 2 && noiseRatio >= 0.4) return true;
  return false;
};

export const isComparativeAuthorityQuery = (message) => {
  const m = normalizeText(message);
  if (!isAuthorityDecisionQuery(m)) return false;
  const numericMentions = m.match(/\d+(?:[.,]\d+)?\s*%?/g) || [];
  return numericMentions.length >= 2 && /(ถ้า|และ|เทียบ|กรณี)/.test(m);
};

export const isOverviewStyleQuery = (message) => {
  const m = normalizeText(message);
  if (!m) return false;
  const patterns = [
    /เอกสารเกี่ยวกับอะไร/,
    /เกี่ยวกับอะไร/,
    /สรุปให้/,
    /สรุป(ให้)?หน่อย/,
    /สรุปทั้งเอกสาร/,
    /ทั้งเอกสาร.*สรุป|สรุป.*ทั้งเอกสาร/,
    /มีอะไรบ้าง/,
    /เนื้อหาโดยรวม/,
    /โดยรวมเป็นยังไง/,
    /สรุปใจความ/,
    /overview|summary|summarize/,
  ];
  return patterns.some((re) => re.test(m));
};

export const isApproverRolesQuery = (message) => {
  const m = normalizeText(message);
  if (!m) return false;
  return /(ผู้อนุมัติ.*แต่ละตำแหน่ง|แต่ละตำแหน่ง.*ผู้อนุมัติ|ผู้อนุมัติมีใครบ้าง|มีใครบ้าง.*ผู้อนุมัติ|รายชื่อตำแหน่งผู้อนุมัติ)/.test(m);
};

export const hasSufficientGroundingEvidence = (message, groundingChunks) => {
  const chunks = Array.isArray(groundingChunks) ? groundingChunks : [];
  if (chunks.length === 0) return false;
  const tokens = extractEvidenceTokens(message);
  if (tokens.length === 0) return true;
  const contextText = chunks
    .slice(0, 4)
    .map((chunk) => String(chunk?.retrievedContext?.text ?? chunk?.payload?.text ?? "").toLowerCase())
    .join("\n");
  if (!contextText.trim()) return false;
  const numericTokens = tokens.filter((token) => /^\d+(?:\.\d+)?%?$/.test(token));
  const textTokens = tokens.filter((token) => !/^\d+(?:\.\d+)?%?$/.test(token));
  const matchedNumeric = numericTokens.filter((token) => contextText.includes(token)).length;
  const matchedText = textTokens.filter((token) => contextText.includes(token)).length;
  const hasPriceSignalInContext = /(บาท|บ\.|\/เดือน|ต่อเดือน|ราคา|ค่าบริการ|\d{2,}(?:[.,]\d+)?)/.test(contextText);
  const hasAuthoritySignalInContext = /(ผู้อนุมัติ|อนุมัติ|อำนาจ|กจญ|รจญ|ชจญ|ผจก|pm|product\s*manager|super\s*product\s*manager)/.test(contextText);

  // คำถาม authority มักมีคำว่า Floor Price/เปอร์เซ็นต์ปนอยู่ แต่หลักฐานที่ต้องการคือสายอนุมัติ ไม่ใช่ราคา
  // จึงต้องไม่ใช้เกณฑ์ pricing-strict ที่บังคับสัญญาณราคา
  if (isAuthorityDecisionQuery(message)) {
    // ไม่บังคับ match ตัวเลข เพราะคำถามแนว authority มักใส่เงื่อนไขตัวเลขหลายแบบ
    // แต่ใจความที่ต้องตอบคือผู้อนุมัติ/สายอนุมัติ
    return matchedText >= 1 && hasAuthoritySignalInContext;
  }

  if (isPricingIntent(message)) {
    if (numericTokens.length > 0) {
      return matchedNumeric >= 1 && matchedText >= 2 && hasPriceSignalInContext;
    }
    return matchedText >= 2 && hasPriceSignalInContext;
  }
  // ถ้าคำถามมีตัวเลข/เปอร์เซ็นต์ ต้อง match อย่างน้อย 1 ตัวเลข + คำหลัก 1 คำ เพื่อกันหยิบบริบทผิดเรื่อง
  if (numericTokens.length > 0) {
    return matchedNumeric >= 1 && matchedText >= 1;
  }
  return matchedText >= 2;
};
