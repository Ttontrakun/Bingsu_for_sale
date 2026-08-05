/**
 * คำตอบสำเร็จรูป (deterministic) + การจัดรูปแบบคำตอบเรื่องอำนาจอนุมัติ + ข้อความ fallback
 * ย้ายมาจาก routes/conversations.js (refactor แยกไฟล์ ไม่เปลี่ยนพฤติกรรม)
 */
import {
  normalizeText,
  formatAuthorityRole,
  isAuthorityDecisionQuery,
  isAuthorityDetailFollowUpQuery,
  isTrial45DaysApprovalQuery,
  hasMultipleQuestions,
  isConsumerInternetPriceQuery,
  isUndergroundDarkFiberPriceQuery,
} from "./queryClassifiers.js";

export const NO_GROUNDING_REPLY = "ขออภัยครับ ยังไม่พบข้อมูลที่ตรงจากเอกสารที่เลือก จึงไม่สามารถยืนยันคำตอบได้";

export const getDeterministicRuleReply = (question) => {
  const m = normalizeText(question);
  if (!m) return null;
  if (isTrial45DaysApprovalQuery(m)) {
    return "ผู้อนุมัติ: ผจก. (ผู้จัดการ)\nหมายเหตุ: กรณีขออนุมัติทดลองใช้บริการ 45 วัน อยู่ในช่วงไม่เกิน 60 วัน จึงใช้อำนาจระดับฝ่าย (ผจก.)";
  }
  if (
    /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
    && /(ระยะเวลาใช้บริการขั้นต่ำ|ขั้นต่ำกี่ปี|ขั้นต่ำ.*กี่ปี)/.test(m)
  ) {
    return "ระยะเวลาใช้บริการขั้นต่ำของ NT Dark Fiber คือ 1 ปี";
  }
  if (
    /(ทดลองใช้|ทดลองผลิตภัณฑ์|ทดลองบริการ)/.test(m)
    && /(สูงสุด|นานสุด|กี่เดือน|นานเท่าไหร่)/.test(m)
  ) {
    return "การทดลองใช้ผลิตภัณฑ์/บริการใหม่กำหนดระยะเวลาเริ่มตั้งแต่ 1 เดือน และไม่เกิน 6 เดือน";
  }
  if (
    /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
    && /(end-?to-?end|last mile|neutral last mile)/.test(m)
  ) {
    return "NT Dark Fiber ให้บริการแบบ End-to-End และไม่ใช่บริการ Last Mile";
  }
  if (
    /(ค่าธรรมเนียมแรกเข้า|one time charge|otc)/.test(m)
    && /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
  ) {
    return "ค่าธรรมเนียมแรกเข้า NT Dark Fiber (One Time Charge) คือ 7,000 บาท/ครั้ง";
  }
  if (
    /(ค่าบริการรายเดือน|รายเดือนเท่าไหร่|เท่าไหร่ต่อเดือน)/.test(m)
    && /(แขวนอากาศ)/.test(m)
    && /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
  ) {
    return "ค่าบริการรายเดือน NT Dark Fiber แบบแขวนอากาศ คือ 1,500 บาท/core/กม./เดือน";
  }
  if (
    /(ล่วงหน้า\s*12\s*เดือน|12\s*เดือน.*ล่วงหน้า)/.test(m)
    && /(ส่วนลด|discount)/.test(m)
    && /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
  ) {
    return "ชำระค่า NT Dark Fiber ล่วงหน้า 12 เดือน ได้ส่วนลด 5% (เฉพาะอัตรา Price List)";
  }
  if (
    /(ผจก\.?|ผู้จัดการฝ่าย|ระดับฝ่าย)/.test(m)
    && /(nt\s*corporate|corporate internet)/.test(m)
    && /(ไม่เกิน|ได้ไม่เกิน|สูงสุด)/.test(m)
    && /(กี่|กี่\s*%|เปอร์เซ็นต์|%)/.test(m)
  ) {
    return "ผจก.ฝ่าย ให้ส่วนลดค่าบริการ NT Corporate Internet ได้ไม่เกิน 30% จากอัตราปกติ";
  }
  if (
    /(ลักลอบใช้|ลักลอบ)/.test(m)
    && /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
    && /(ค่าดำเนินการ|ค่าเสียหาย|เท่าไหร่|เท่าไร)/.test(m)
  ) {
    return "ค่าดำเนินการกรณีลักลอบใช้ NT Dark Fiber คือ 50,000 บาท/ครั้ง และต้องชำระค่าเสียหาย 10 เท่าของอัตราปกติ";
  }
  return null;
};

export const getAuthorityOverrideFromQuestion = (question) => {
  const m = normalizeText(question);
  if (!m) return null;
  const isNtCorporateDiscountCase =
    /(nt\s*corporate|ลูกค้าองค์กร|ส่วนลดเฉพาะรายสำหรับลูกค้าองค์กร)/.test(m) &&
    /(floor\s*price|floorprice|เกิน\s*floor|เกินราคาขั้นต่ำ|ต่ำกว่าราคาขั้นต่ำ|ฟลอร์\s*ไพรซ์)/.test(m);
  if (isNtCorporateDiscountCase) {
    return {
      approver: "รจญ.",
      note: "ต้องผ่านการพิจารณาจากฝ่ายบริหารจัดการผลิตภัณฑ์ (PM) ก่อนเสนออนุมัติ",
    };
  }
  if (/(เส้นใยแก้วนำแสง|nt dark fiber)/.test(m) && /(ไม่เกินร้อยละ\s*50|ไม่เกิน\s*50|price list)/.test(m)) {
    return {
      approver: "ชจญ.",
      note: "ชจญ.ที่รับผิดชอบงานขาย/บริการลูกค้า (ต้องผ่านความเห็น PM ก่อน)",
    };
  }
  if (
    /(ส่วนลดเฉพาะรายสำหรับลูกค้าองค์กร|นำรายการส่งเสริมการขายไปให้ส่วนลดเฉพาะรายสำหรับลูกค้าองค์กร)/.test(m)
  ) {
    return {
      approver: "รจญ.",
      note: "ต้องผ่านการพิจารณาจากฝ่ายบริหารจัดการผลิตภัณฑ์ (PM) ก่อนเสนออนุมัติ",
    };
  }
  return null;
};

export const getAuthorityOverrideFromReply = (reply) => {
  const r = normalizeText(reply);
  if (!r) return null;
  const hasFloorPrice = /(floor\s*price|floorprice|เกิน\s*floor|เกินราคาขั้นต่ำ|ต่ำกว่าราคาขั้นต่ำ|ฟลอร์\s*ไพรซ์)/.test(r);
  const hasCorporateHint = /(nt\s*corporate|ลูกค้าองค์กร|ส่วนลดเฉพาะรายสำหรับลูกค้าองค์กร)/.test(r);
  const hasPmWorkflowHint = /(pm|ผู้จัดการผลิตภัณฑ์|บริหารจัดการผลิตภัณฑ์)/.test(r);
  const hasRjYHint = /(รจญ\.?|รองกรรมการผู้จัดการใหญ่)/.test(r);
  if ((hasCorporateHint && hasFloorPrice) || (hasFloorPrice && hasPmWorkflowHint && hasRjYHint)) {
    return {
      approver: "รจญ.",
      note: "ต้องผ่านการพิจารณาจากฝ่ายบริหารจัดการผลิตภัณฑ์ (PM) ก่อนเสนออนุมัติ",
    };
  }
  if (
    /(ส่วนลดเฉพาะรายสำหรับลูกค้าองค์กร|นำรายการส่งเสริมการขายไปให้ส่วนลดเฉพาะรายสำหรับลูกค้าองค์กร)/.test(r) &&
    /(pm|ผู้จัดการผลิตภัณฑ์)/.test(r)
  ) {
    return {
      approver: "รจญ.",
      note: "ต้องผ่านการพิจารณาจากฝ่ายบริหารจัดการผลิตภัณฑ์ (PM) ก่อนเสนออนุมัติ",
    };
  }
  return null;
};

export const toCompactAuthorityReply = (question, reply) => {
  const rawReply = String(reply || "").trim();
  if (!rawReply) return rawReply;
  if (!isAuthorityDecisionQuery(question)) return rawReply;
  // ถามหลายข้อ: ห้ามย่อเหลือ 2 บรรทัด ไม่งั้นคำตอบข้ออื่นจะหายไป
  if (hasMultipleQuestions(question)) return rawReply;
  // ถ้าโมเดลตอบมาแบบละเอียดอยู่แล้ว (เช่น bullet/ลำดับขั้น) ไม่ต้องย่อ
  // เพื่อกันเคสกด "อธิบายเพิ่มเติม" แล้วคำตอบโดนทับเป็นเวอร์ชันสั้น
  const hasStructuredDetails =
    rawReply.split(/\r?\n/).length >= 4
    || /(?:^|\n)\s*[-*•]\s+/.test(rawReply)
    || /(?:^|\n)\s*\d+[.)]\s+/.test(rawReply);
  if (hasStructuredDetails) return rawReply;
  // Follow-up ที่ต้องการ "อธิบายเพิ่ม/ยกตัวอย่าง" ไม่ควรถูกย่อเป็น 2 บรรทัด
  // ไม่งั้นคำตอบละเอียดจะถูกทับด้วยรูปแบบ compact โดยไม่จำเป็น
  if (isAuthorityDetailFollowUpQuery(question)) return rawReply;

  // ให้เคส authority สำคัญ (เช่น NT Corporate เกิน Floor Price) ถูก normalize ตรงตามกติกาเสมอ
  // และ fallback จากข้อความตอบ เมื่อโมเดลตอบมาใกล้เคียงแต่รูปแบบไม่คงที่
  const override = getAuthorityOverrideFromQuestion(question) || getAuthorityOverrideFromReply(rawReply);
  if (override) {
    return `ผู้อนุมัติ: ${formatAuthorityRole(override.approver)}\nหมายเหตุ: ${override.note}`;
  }

  const normalizedLines = rawReply
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter((line) => line && !/^รายละเอียด\s*:?$/i.test(line));
  if (normalizedLines.length === 0) return rawReply;

  const authorityPriority = [
    { re: /กจญ\.?/i, label: "กจญ." },
    { re: /กรรมการผู้จัดการใหญ่/i, label: "กจญ." },
    { re: /รจญ\.?/i, label: "รจญ." },
    { re: /รองกรรมการผู้จัดการใหญ่/i, label: "รจญ." },
    { re: /ชจญ\.?/i, label: "ชจญ." },
    { re: /ผู้ช่วยกรรมการผู้จัดการใหญ่/i, label: "ชจญ." },
  ];

  const authorityMatch = authorityPriority.find(({ re }) => normalizedLines.some((line) => re.test(line)));
  const approverLine = authorityMatch
    ? normalizedLines.find((line) => authorityMatch.re.test(line))
    : normalizedLines.find((line) =>
        /(ผู้อนุมัติ|อนุมัติโดย|อำนาจอนุมัติ|มีอำนาจ|กจญ\.?|กรรมการผู้จัดการใหญ่|รองกรรมการผู้จัดการใหญ่|ผู้ช่วยกรรมการผู้จัดการใหญ่)/i.test(line),
      ) || normalizedLines[0];

  let approverValue = approverLine
    .replace(/^(ผู้อนุมัติ|อำนาจอนุมัติ|ผู้รับผิดชอบ)\s*[:：]\s*/i, "")
    .replace(/^.*?(?:อนุมัติ(?:โดย|จาก)?|มีอำนาจ(?:อนุมัติ)?)(?:\s*[:：])?\s*/i, "")
    .trim();
  if (!approverValue) approverValue = approverLine;
  approverValue = approverValue.replace(/^เป็นผู้อนุมัติ\s*/i, "").trim();
  approverValue = formatAuthorityRole(approverValue);
  if (authorityMatch?.label && approverValue === approverLine) {
    approverValue = formatAuthorityRole(authorityMatch.label);
  }

  const noteLine = normalizedLines.find(
    (line) =>
      line !== approverLine &&
      /(ต้อง|ก่อน|ผ่าน|เสนอ|หมายเหตุ|เงื่อนไข|pm|ผู้จัดการผลิตภัณฑ์)/i.test(line),
  );

  let noteValue = (noteLine || "").replace(/^หมายเหตุ\s*[:：]\s*/i, "").trim();
  if (!noteValue && /(ต้อง|ก่อน|ผ่าน|เสนอ|pm|ผู้จัดการผลิตภัณฑ์)/i.test(approverLine)) {
    noteValue = approverLine;
  }

  const compactLines = [`ผู้อนุมัติ: ${approverValue}`];
  if (noteValue) compactLines.push(`หมายเหตุ: ${noteValue}`);
  return compactLines.join("\n");
};

export const stripDocumentLeadIn = (reply) => {
  let text = String(reply || "").trim();
  if (!text) return text;
  const leadInPatterns = [
    /^\s*(?:คำตอบคือ\s*[:：]\s*)?(?:ตาม|จาก)\s*เอกสาร(?:ที่(?:ส่งมา|ให้มา|แนบมา|เลือก)|ประกอบ)?\s*(?:นี้|ดังกล่าว)?\s*[,:\-–—]?\s*/i,
    /^\s*(?:คำตอบคือ\s*[:：]\s*)?อ้างอิงจากเอกสาร\s*(?:ที่(?:ส่งมา|ให้มา|แนบมา|เลือก)|ประกอบ)?\s*(?:นี้|ดังกล่าว)?\s*[,:\-–—]?\s*/i,
    /^\s*(?:คำตอบคือ\s*[:：]\s*)?จากข้อมูลในเอกสาร\s*(?:ที่(?:ส่งมา|ให้มา|แนบมา|เลือก)|ประกอบ)?\s*(?:นี้|ดังกล่าว)?\s*[,:\-–—]?\s*/i,
  ];
  for (const pattern of leadInPatterns) {
    text = text.replace(pattern, "").trim();
  }
  return text;
};

export const getNoDataReply = (message) => {
  if (isConsumerInternetPriceQuery(message)) {
    return "ขออภัยครับ ไม่มีข้อมูลโปรเน็ตบ้านในเอกสารที่เลือก จึงไม่สามารถยืนยันราคาได้";
  }
  if (isUndergroundDarkFiberPriceQuery(message)) {
    return "ไม่มีข้อมูลในเอกสารสำหรับค่าบริการ NT Dark Fiber แบบร้อยสายใต้ดินต่อเดือน";
  }
  return NO_GROUNDING_REPLY;
};

export const shouldForceNoDataReply = (message) => isUndergroundDarkFiberPriceQuery(message);

export const getUnintelligibleReply = () => "ขออภัยครับ ข้อความที่ส่งมายังอ่านไม่ชัดเจน รบกวนพิมพ์ใหม่อีกครั้งให้ชัดเจนขึ้นครับ";

export const getSystemCapabilityReply = (contextDocuments = []) => {
  const docs = (contextDocuments || [])
    .map((doc) => String(doc?.displayName || doc?.fileName || "").trim())
    .filter(Boolean);
  const uniqueDocs = Array.from(new Set(docs)).slice(0, 8);
  if (uniqueDocs.length === 0) {
    return "ตอนนี้ระบบตอบได้ตามเอกสารที่เลือกไว้ เช่น ค่าบริการ เงื่อนไขส่วนลด ผู้อนุมัติ และขั้นตอนที่ระบุในเอกสารครับ";
  }
  return `ระบบตอบได้ตามข้อมูลในเอกสารที่เลือกตอนนี้ เช่น:\n- ${uniqueDocs.join("\n- ")}\n\nถ้าต้องการ ผมสรุปหัวข้อสำคัญของแต่ละเอกสารให้ต่อได้ครับ`;
};

export const collectApproverAbbreviations = (...texts) => {
  const merged = texts
    .map((t) => String(t || ""))
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  const found = new Set();
  // normalize known variants/typos to canonical abbreviations
  if (/(ผจก\.?|ผู้จัดการ)/i.test(merged)) found.add("ผจก.");
  if (/(ชจญ\.?|ชจรย\.?|ผู้ช่วยกรรมการผู้จัดการใหญ่)/i.test(merged)) found.add("ชจญ.");
  if (/(รจญ\.?|รองกรรมการผู้จัดการใหญ่)/i.test(merged)) found.add("รจญ.");
  if (/(กจญ\.?|กรรมการผู้จัดการใหญ่)/i.test(merged)) found.add("กจญ.");
  const order = ["ผจก.", "ชจญ.", "รจญ.", "กจญ."];
  return order.filter((abbr) => found.has(abbr));
};

export const buildApproverRolesReply = (groundingChunks, contextText = "") => {
  const chunkTexts = Array.isArray(groundingChunks)
    ? groundingChunks.map((chunk) => String(chunk?.retrievedContext?.text ?? chunk?.payload?.text ?? "")).filter(Boolean)
    : [];
  const approvers = collectApproverAbbreviations(...chunkTexts, contextText);
  if (approvers.length === 0) return "ผู้อนุมัติ: ไม่พบข้อมูลผู้อนุมัติที่ชัดเจนในบริบทที่ดึงได้";
  return `ผู้อนุมัติ: ${approvers.map((approver) => formatAuthorityRole(approver)).join(", ")}`;
};
