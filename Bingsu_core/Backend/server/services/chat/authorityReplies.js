/**
 * คำตอบสำเร็จรูป (deterministic) + การจัดรูปแบบคำตอบเรื่องอำนาจอนุมัติ + ข้อความ fallback
 * ย้ายมาจาก routes/conversations.js (refactor แยกไฟล์ ไม่เปลี่ยนพฤติกรรม)
 */
import {
  normalizeText,
  formatAuthorityRole,
  AUTHORITY_ROLE_MAP,
  isAuthorityDecisionQuery,
  isAuthorityRoleConfirmQuery,
  isAuthorityDetailFollowUpQuery,
  isTrial45DaysApprovalQuery,
  isRememberOverrideRequest,
  hasMultipleQuestions,
  isConsumerInternetPriceQuery,
  isUndergroundDarkFiberPriceQuery,
  isDocumentListQuery,
  isSystemFeatureQuery,
} from "./queryClassifiers.js";

export const NO_GROUNDING_REPLY = "ขออภัยครับ ยังไม่พบข้อมูลที่ตรงจากเอกสารที่เลือก จึงไม่สามารถยืนยันคำตอบได้";

export const OUT_OF_SCOPE_REPLY =
  "คำถามนี้อยู่นอกขอบเขตเอกสารที่เลือกครับ ผมตอบได้เฉพาะข้อมูลในเอกสาร/ชุดความรู้เท่านั้น เช่น ราคา ค่าบริการ ส่วนลด อำนาจอนุมัติ หรือขั้นตอนตามเอกสาร";

/** ส่งข้อเท็จจริงให้โมเดลเรียบเรียง — ห้ามตัดจบด้วยประโยคสำเร็จรูปตรงๆ */
export const buildAuthoritativeFactPrompt = (facts) => {
  const body = String(facts || "").trim();
  if (!body) return "";
  return [
    "ข้อมูลที่ยืนยันแล้ว (ต้องใช้ตอบ):",
    body,
    "",
    "เรียบเรียงคำตอบภาษาไทยให้อ่านลื่น เป็นมิตร เหมือนผู้ช่วยคุยปกติ",
    "เก็บความหมาย ตัวเลข ชื่อตำแหน่ง และข้อสรุปให้ถูกต้องครบ",
    "ห้ามเปลี่ยนข้อเท็จจริง ห้ามแต่งตัวเลขหรือเงื่อนไขเพิ่ม",
    "หากถามหลายประเด็นให้ตอบครบทุกข้อ",
  ].join("\n");
};

/** คำตอบปฏิเสธ/นอกขอบเขต — ห้ามแปะการ์ดอ้างอิงเอกสาร (กัน top-k ติดมาทั้งที่ไม่ได้ใช้ตอบ) */
export const shouldOmitReferencesForReply = (reply) => {
  const t = String(reply || "").trim();
  if (!t) return true;
  if (/นอกขอบเขต/.test(t)) return true;
  if (/ยังไม่พบข้อมูลที่ตรงจากเอกสาร/.test(t)) return true;
  if (/ไม่สามารถยืนยันคำตอบได้/.test(t)) return true;
  if (/ตอบได้เฉพาะ.*(เอกสาร|ชุดความรู้)/.test(t) && t.length < 450) return true;
  if (/^ขออภัย[\s\S]{0,80}ไม่(มี|พบ)ข้อมูล/.test(t) && t.length < 280) return true;
  if (/^ไม่มีข้อมูลในเอกสาร/.test(t) && t.length < 280) return true;
  if (/outside (the )?scope|not (found )?in (the )?document|information is unavailable/i.test(t) && t.length < 450) {
    return true;
  }
  return false;
};

/** ตัดข้อความที่ขอบคำ/ประโยค — ไม่ใส่ ... และไม่ตัดกลางคำ */
const clipAtSentence = (text, maxLen = 520) => {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= maxLen) return clean;
  const slice = clean.slice(0, maxLen);
  const markers = ["ครับ", "ค่ะ", "คะ", "。", ".", ")", "]", " "];
  let boundary = -1;
  for (const marker of markers) {
    const idx = slice.lastIndexOf(marker);
    if (idx > boundary) boundary = idx + (marker === " " ? 0 : marker.length);
  }
  if (boundary >= Math.floor(maxLen * 0.4)) {
    return slice.slice(0, boundary).trim();
  }
  // fallback: ถอยไปช่องว่างล่าสุด แล้วจบโดยไม่ใส่ ...
  const space = slice.lastIndexOf(" ");
  return (space > 40 ? slice.slice(0, space) : slice).trim();
};

/** แยกแหล่ง (Sheet/Row) ออกจากเนื้อหา เพื่อให้อ่านง่าย */
const parseChunkForDisplay = (rawText) => {
  const text = String(rawText || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  // รูปแบบที่พบบ่อย: Sheet ... | Row N | เรื่อง: ... เนื้อหา
  const metaMatch = text.match(
    /^(?:Sheet\s*)?([^|]+?)\s*\|\s*Row\s*(\d+)\s*\|\s*(?:เรื่อง\s*[:：]\s*)?(.+)$/i,
  );
  if (metaMatch) {
    const sheet = metaMatch[1].replace(/^Sheet\s*/i, "").trim();
    const row = metaMatch[2];
    let body = String(metaMatch[3] || "").trim();
    // ถ้า body ยังขึ้นต้นด้วย "เรื่อง: x.x" ให้ตัดหัวข้อสั้นๆ ออกเป็น title
    let topic = "";
    const topicMatch = body.match(/^(?:เรื่อง\s*[:：]\s*)?(\d+(?:\.\d+)*)\s+(.+)$/);
    if (topicMatch) {
      topic = topicMatch[1];
      body = topicMatch[2].trim();
    }
    return {
      source: topic ? `${sheet} (แถว ${row}, เรื่อง ${topic})` : `${sheet} (แถว ${row})`,
      body: clipAtSentence(body, 480),
    };
  }
  return { source: "", body: clipAtSentence(text, 480) };
};

export const buildDocumentStanceFromChunks = (groundingChunks = []) => {
  const points = [];
  const seen = new Set();
  for (const chunk of (Array.isArray(groundingChunks) ? groundingChunks : []).slice(0, 4)) {
    const raw = String(chunk?.retrievedContext?.text ?? chunk?.payload?.text ?? "").trim();
    const parsed = parseChunkForDisplay(raw);
    if (!parsed?.body) continue;
    const key = parsed.body.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(parsed);
  }
  if (points.length === 0) return "";
  return points
    .map((p, i) => {
      const head = p.source ? `${i + 1}) ${p.source}` : `${i + 1})`;
      return `${head}\n   ${p.body}`;
    })
    .join("\n\n");
};

/** สรุปสั้นเทียบสิ่งที่ผู้ใช้ขอจำ กับเอกสาร */
export const buildRememberOverrideSummary = (userMessage, whoOverride = null, hasDocFacts = false) => {
  const m = normalizeText(userMessage);
  if (!hasDocFacts && !whoOverride) {
    return "สรุป: ยังไม่พบข้อมูลในเอกสารที่เลือกมาเทียบกับสิ่งที่คุณต้องการให้จำ — หากต้องการอัปเดตเอกสารจริง ให้ติดต่อผู้ดูแล (Supportadmin)";
  }
  if (whoOverride?.approver || /(กจญ|รจญ|ชจญ|ผจก|อำนาจอนุมัติ|ส่วนลด)/.test(m)) {
    if (whoOverride?.approver) {
      return `สรุป: ตามเอกสาร อำนาจอนุมัติส่วนลดไม่ได้จำกัดที่ตำแหน่งเดียวเสมอไป — แบ่งตามเงื่อนไข/ระดับส่วนลด (เช่น กรณีที่เกี่ยวข้อง ผู้อนุมัติคือ ${formatAuthorityRole(whoOverride.approver)}) จึงยังไม่ตรงกับข้อความที่ต้องการให้จำในโหมดปกติ`;
    }
    return "สรุป: ตามเอกสาร อำนาจอนุมัติส่วนลดถูกแบ่งตามระดับส่วนลดและประเภทบริการ ไม่ได้กำหนดให้ตำแหน่งเดียวอนุมัติทุกโปรดักต์";
  }
  if (/(ไม่ขาย|ยกเลิก|หยุดจำหน่าย)/.test(m) && /(dark\s*fiber|เส้นใย)/.test(m)) {
    return "สรุป: ตามเอกสารยังมีการกำหนดบริการและอัตรา NT Dark Fiber อยู่ จึงยังไม่สอดคล้องกับข้อความว่าไม่ขายแล้ว — หากต้องการให้ระบบใช้ข้อมูลใหม่ ต้องอัปเดตเอกสารโดยผู้ดูแล หรือบันทึกในโหมดส่วนตัว";
  }
  if (/(ไม่ขาย|ยกเลิก|หยุดจำหน่าย)/.test(m)) {
    return "สรุป: ตามเอกสารยังมีข้อมูลบริการที่เกี่ยวข้องอยู่ จึงยังไม่ตรงกับข้อความว่ายกเลิก/ไม่ขายแล้ว — หากต้องการใช้ข้อมูลใหม่ ให้เปิดโหมดส่วนตัวหรืออัปเดตเอกสารโดยผู้ดูแล";
  }
  return "สรุป: สิ่งที่คุณต้องการให้จำยังไม่ถูกบันทึกในโหมดปกติ — ระบบยังยึดข้อมูลจากเอกสารด้านบนเป็นหลัก";
};

/**
 * คำตอบเต็มสำหรับ "จำไว้ว่า..." ในโหมดปกติ
 * — เน้นว่าโหมดปกติ ≠ โหมดส่วนตัว + วิธีใช้โหมดส่วนตัว + เอกสาร
 */
export const buildNormalModeRememberGuidance = (documentSection = "", summary = "") => {
  const facts = String(documentSection || "").trim()
    || "ยังไม่พบข้อมูลที่เกี่ยวข้องชัดเจนในเอกสารที่เลือก";
  const summaryLine = String(summary || "").trim()
    || "สรุป: ในโหมดปกติระบบยังยึดเอกสารเป็นหลัก และยังไม่ได้จดจำข้อความที่คุณต้องการให้จำ";
  return [
    "เข้าใจครับ — แต่โหมดปกติกับโหมดส่วนตัวแยกกันครับ",
    "",
    "• โหมดปกติ: ยึดเอกสาร/ตารางในระบบเท่านั้น แก้หรือทับข้อมูลจากแชทไม่ได้",
    "• โหมดส่วนตัว: คุณแก้/ทับข้อมูลสำหรับตัวคุณเองได้ (เช่น กำหนดผู้อนุมัติคนละแบบจากเอกสาร) โดยไม่กระทบผู้ใช้อื่น",
    "",
    "ถ้าต้องการให้บอทจำตามที่คุณป้อน:",
    "1) เปิดโหมดส่วนตัว จากแถบด้านข้าง",
    "2) พิมพ์ /จำ ตามด้วยข้อมูล หรือพิมพ์ว่า จำว่า ...",
    "3) ถามใหม่ในโหมดส่วนตัว (สวิตช์หน่วยความจำส่วนตัวต้องเปิด)",
    "",
    "ตามเอกสารในระบบตอนนี้:",
    facts,
    "",
    summaryLine,
  ].join("\n");
};

/** ยืนยันหลังบันทึกความจำในโหมดส่วนตัว — ห่อข้อมูลที่จำด้วย == เพื่อให้ UI ไฮไลต์ */
export const buildPrivateRememberConfirmReply = (payload) => {
  const fact = String(payload || "").trim();
  return [
    "บันทึกในโหมดส่วนตัวแล้วครับ",
    fact ? `==ข้อมูลที่จำ: ${fact}==` : null,
    "",
    "หมายเหตุ: ใช้เฉพาะในโหมดส่วนตัวของคุณเท่านั้น — ไม่เปลี่ยนเอกสาร/ตารางอำนาจของโหมดปกติ และไม่กระทบผู้ใช้อื่น",
    "ถามต่อในโหมดส่วนตัวได้เลย ระบบจะยึดข้อมูลส่วนตัวของคุณก่อนเอกสารระบบ",
  ].filter((line) => line != null).join("\n");
};

/** สร้างคำตอบ remember-override ทั้งก้อนจากข้อความผู้ใช้ + chunks */
export const buildRememberOverrideReply = (userMessage, groundingChunks = [], whoOverride = null) => {
  let stance = "";
  if (whoOverride?.approver) {
    stance = [
      `1) อำนาจอนุมัติตามเอกสาร`,
      `   ผู้อนุมัติที่เกี่ยวข้อง: ${formatAuthorityRole(whoOverride.approver)}`,
      whoOverride.note ? `   เงื่อนไข: ${whoOverride.note}` : null,
      "",
      buildDocumentStanceFromChunks(groundingChunks),
    ].filter(Boolean).join("\n").trim();
  } else {
    stance = buildDocumentStanceFromChunks(groundingChunks);
  }
  const summary = buildRememberOverrideSummary(userMessage, whoOverride, Boolean(stance));
  return buildNormalModeRememberGuidance(stance, summary);
};

/** ตอบคำถามยืนยันบทบาท: ได้/ไม่ได้ ตามกติกา deterministic + ชื่อผู้อนุมัติที่ถูก */
export const getAuthorityRoleConfirmReply = (question) => {
  if (!isAuthorityRoleConfirmQuery(question)) return null;
  const override = getAuthorityOverrideFromQuestion(question);
  if (!override?.approver) return null;
  const asked = AUTHORITY_ROLE_MAP.find((entry) => entry.re.test(String(question || "")));
  if (!asked) return null;
  const approverNorm = normalizeText(override.approver);
  const isMatch = asked.re.test(override.approver) || approverNorm.includes(normalizeText(asked.abbr.replace(".", "")));
  const approverLabel = formatAuthorityRole(override.approver);
  if (isMatch) {
    return [
      `ได้ครับ — ผู้อนุมัติในกรณีนี้คือ ${approverLabel}`,
      override.note ? `หมายเหตุ: ${override.note}` : null,
    ].filter(Boolean).join("\n");
  }
  return [
    `ตามเอกสาร ${formatAuthorityRole(asked.abbr)} ไม่ใช่ผู้อนุมัติในกรณีนี้`,
    `ผู้อนุมัติ: ${approverLabel}`,
    override.note ? `หมายเหตุ: ${override.note}` : null,
  ].filter(Boolean).join("\n");
};

export const getDeterministicRuleReply = (question) => {
  const m = normalizeText(question);
  if (!m) return null;
  const roleConfirmReply = getAuthorityRoleConfirmReply(question);
  if (roleConfirmReply) return roleConfirmReply;
  // คำถาม "ใครอนุมัติ..." ที่มีกติกา deterministic ชัดเจน
  if (/(ใครอนุมัติ|ใครมีอำนาจ|ผู้อนุมัติคือใคร)/.test(m)) {
    const who = getAuthorityOverrideFromQuestion(question);
    if (who?.approver) {
      return [
        `ผู้อนุมัติ: ${formatAuthorityRole(who.approver)}`,
        who.note ? `หมายเหตุ: ${who.note}` : null,
      ].filter(Boolean).join("\n");
    }
  }
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
  // การวัดระยะทาง Dark Fiber: เศษ ≤500m → 500m, เศษ >500m → 1 กม.
  if (
    /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
    && /(วัดระยะ|ระยะทาง|เศษของกิโล|เศษกิโล|เศษ\s*\d|หน่วยวัด|คิดระยะ|เศษ.*เมตร|\d+\s*เมตร)/.test(m)
  ) {
    if (/(ไม่เกิน\s*500|น้อยกว่าหรือเท่ากับ\s*500|≤\s*500|<=\s*500)/.test(m)) {
      return "คิดเป็น 500 เมตรครับ";
    }
    if (/(เกิน\s*500|มากกว่า\s*500|>\s*500)/.test(m)) {
      return "คิดเป็น 1 กิโลเมตรครับ";
    }
    const fracMatch =
      m.match(/เศษ(?:ของกิโลเมตร|กิโลเมตร)?[^\d]{0,24}(\d{2,4})\s*เมตร/)
      || m.match(/(?:เศษ|ระยะ|เป็น)\s*(\d{2,4})\s*เมตร/)
      || m.match(/(\d{2,4})\s*เมตร/);
    if (fracMatch) {
      const meters = Number(fracMatch[1]);
      if (Number.isFinite(meters) && meters > 500) {
        return "คิดเป็น 1 กิโลเมตรครับ";
      }
      if (Number.isFinite(meters) && meters > 0 && meters <= 500) {
        return "คิดเป็น 500 เมตรครับ";
      }
    }
    if (/(วัดระยะ|ระยะทาง|หน่วยวัด|เศษ)/.test(m)) {
      return "การวัดระยะทาง NT Dark Fiber ใช้หน่วยวัดขั้นต่ำ 1 กิโลเมตรครับ — เศษไม่เกิน 500 เมตรคิด 500 เมตร ส่วนเศษเกิน 500 เมตรคิดเป็น 1 กิโลเมตร";
    }
  }
  // ★กับดัก: ค่าติดตั้ง ≠ ค่าธรรมเนียมแรกเข้า 7,000 (ต้องมาก่อนกฎ OTC)
  if (
    /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
    && /(ค่าติดตั้ง)/.test(m)
  ) {
    return "ในเอกสารยังไม่ระบุค่าติดตั้ง NT Dark Fiber เป็นจำนวนตายตัวครับ — ค่าดำเนินการสร้างเส้นใยส่วนเพิ่มจะประเมินตามพื้นที่จริง";
  }
  if (
    /(ค่าธรรมเนียมแรกเข้า|one time charge|\botc\b)/.test(m)
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
  // ★กับดัก: อย่าเอาเพดาน 30% ของ Corporate มาตอบ Dark Fiber
  if (
    /(ผจก\.?|ผู้จัดการฝ่าย|ระดับฝ่าย)/.test(m)
    && /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
    && /(ส่วนลด|ไม่เกิน|กี่\s*%|กี่%|เปอร์เซ็นต์|%)/.test(m)
  ) {
    return "สำหรับ NT Dark Fiber เอกสารไม่ได้กำหนดเพดานส่วนลดเฉพาะของ ผจก.ฝ่ายครับ อำนาจอนุมัติส่วนลดเริ่มที่ระดับ ชจญ. สำหรับส่วนลดไม่เกิน 50% ของ Price List (เกณฑ์ 30% เป็นของ NT Corporate Internet)";
  }
  if (
    /(call\s*center|คอล\s*เซ็นเตอร์|คอลเซ็นเตอร์|เบอร์โทร|เบอร์ติดต่อ)/.test(m)
    && /(ลูกค้าทั่วไป|call\s*center|คอลเซ็นเตอร์)/.test(m)
  ) {
    return "ในเอกสารที่เลือกยังไม่พบเบอร์ Call Center สำหรับลูกค้าทั่วไปครับ (อาจมีเฉพาะเบอร์ติดต่อภายในฝ่ายผลิตภัณฑ์)";
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
  if (/(เส้นใยแก้วนำแสง|nt dark fiber|dark fiber)/.test(m) && /(ไม่เกินร้อยละ\s*50|ไม่เกิน\s*50|price list)/.test(m)
    && !/(มากกว่า|เกิน|60|ร้อยละ\s*60)/.test(m)) {
    return {
      approver: "ชจญ.",
      note: "ชจญ.ที่รับผิดชอบงานขาย/บริการลูกค้า (ต้องผ่านความเห็น PM ก่อน)",
    };
  }
  // ส่วนลด Dark Fiber เกิน 50% แต่ไม่เกิน Floor Price (เช่น 60%) → รจญ.
  if (
    /(เส้นใยแก้วนำแสง|nt dark fiber|dark fiber)/.test(m)
    && (
      /(60|ร้อยละ\s*60)/.test(m)
      || (/(มากกว่า|เกิน|มากกว่าร้อยละ)/.test(m) && /(50|ร้อยละ\s*50)/.test(m))
    )
  ) {
    return {
      approver: "รจญ.",
      note: "กรณีส่วนลดเกิน 50% แต่ไม่เกิน Floor Price ต้องผ่านความเห็น Product Manager และฝ่ายกรอบอัตราก่อน",
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

export const toCompactAuthorityReply = (question, reply, options = {}) => {
  const respectPrivate = options.respectPrivate === true;
  const rawReply = String(reply || "").trim();
  if (!rawReply) return rawReply;
  if (!isAuthorityDecisionQuery(question)) return rawReply;
  // โหมดส่วนตัวที่มี Private Knowledge: ห้าม post-process ทับคำตอบด้วยกติกาเอกสาร
  // (ไม่งั้นตอนสตรีมจบ ผู้ใช้จะเห็นคำตอบเปลี่ยนจาก /จำ กลับไปเป็นเอกสาร)
  if (respectPrivate) return rawReply;
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

/** แปลงเศษ LaTeX ในคำตอบให้เป็นข้อความธรรมดา (UI ไม่เรนเดอร์ math) */
const latexInnerToPlain = (inner) => {
  let t = String(inner || "");
  t = t.replace(/\\text\s*\{([^{}]*)\}/g, "$1");
  t = t.replace(/\\mathrm\s*\{([^{}]*)\}/g, "$1");
  t = t.replace(/\\mathbf\s*\{([^{}]*)\}/g, "$1");
  t = t.replace(/\\textbf\s*\{([^{}]*)\}/g, "$1");
  t = t.replace(/\\textit\s*\{([^{}]*)\}/g, "$1");
  t = t.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)");
  t = t.replace(/\\times/g, "×");
  t = t.replace(/\\cdot/g, "·");
  t = t.replace(/\\div/g, "÷");
  t = t.replace(/\\approx/g, "≈");
  t = t.replace(/\\leq|\\le\b/g, "≤");
  t = t.replace(/\\geq|\\ge\b/g, "≥");
  t = t.replace(/\\neq|\\ne\b/g, "≠");
  t = t.replace(/\\%/g, "%");
  t = t.replace(/\\,/g, " ");
  t = t.replace(/\\;/g, " ");
  t = t.replace(/\\quad/g, " ");
  t = t.replace(/\\qquad/g, " ");
  t = t.replace(/~/g, " ");
  t = t.replace(/\\\\/g, "\n");
  t = t.replace(/\{([^{}]*)\}/g, "$1");
  t = t.replace(/\\([a-zA-Z]+)/g, "");
  t = t.replace(/[ \t]{2,}/g, " ");
  return t.trim();
};

/**
 * ตัด/แปลง LaTeX ที่โมเดลมักแปะมา (เช่น \text{...}, \[...\], [...\text...])
 * ให้เหลือข้อความไทย/ตัวเลขอ่านง่าย
 */
export const stripLatexToPlainText = (reply) => {
  let text = String(reply || "");
  if (!text || !/\\[a-zA-Z]|\$\$|\\\[|\\\(/.test(text)) return text;

  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => latexInnerToPlain(inner));
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => latexInnerToPlain(inner));
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => latexInnerToPlain(inner));
  text = text.replace(/\$([^$\n]+)\$/g, (_, inner) => latexInnerToPlain(inner));
  // บล็อก [ ... \text ... ] แบบที่โมเดลชอบห่อสูตร
  text = text.replace(/\[\s*((?:[^\]]|\\\])*\\(?:text|times|frac|cdot)[\s\S]*?)\]/g, (_, inner) => (
    latexInnerToPlain(inner)
  ));
  // เศษคำสั่งที่หลุดค้างนอกบล็อก
  if (/\\[a-zA-Z]/.test(text)) {
    text = latexInnerToPlain(text);
  }
  return text.replace(/\n{3,}/g, "\n\n").trim();
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

/** รายการไฟล์เอกสารทั้งหมดแบบแบน (ไม่แยกชุดหลัก/ย่อย กันชื่อซ้ำ) */
const getDocumentListReply = (contextDocuments = []) => {
  const docs = (contextDocuments || []).filter(Boolean);
  const names = [];
  for (const doc of docs) {
    const files = Array.isArray(doc?.sourceFiles) ? doc.sourceFiles : [];
    let added = 0;
    for (const file of files) {
      const name = String(file?.fileName || file?.name || file?.displayName || "").trim();
      if (!name) continue;
      names.push(name);
      added += 1;
    }
    // ไม่มีไฟล์ใน sourceFiles — ใช้ชื่อชุดความรู้แทน
    if (added === 0) {
      const fallback = String(doc?.displayName || doc?.fileName || "").trim();
      if (fallback) names.push(fallback);
    }
  }
  const uniqueDocs = Array.from(new Set(names));
  if (uniqueDocs.length === 0) {
    return "ตอนนี้ยังไม่พบเอกสารในชุดความรู้ที่เลือกครับ ลองเลือกชุดความรู้ หรืออัปโหลดไฟล์ก่อนแล้วถามใหม่ได้ครับ";
  }
  return [
    `เอกสารที่ใช้งานได้ตอนนี้มี ${uniqueDocs.length} รายการ:`,
    ...uniqueDocs.map((name, index) => `${index + 1}. ${name}`),
    "",
    "ถามต่อได้เลยครับ เช่น สรุปเอกสาร ราคา ส่วนลด หรืออำนาจอนุมัติ",
    "ถ้าต้องการเนื้อหาเฉพาะ เช่น เอกสารแนบตอนขอใช้บริการ ให้ระบุบริการ/หัวข้อให้ชัดเจนครับ",
  ].join("\n");
};

const getSystemFeatureReply = () => {
  // เฉพาะของฝั่ง User (แถบด้านข้าง + หน้าแชท/หน้าแรก) — ไม่รวม Supportadmin
  const features = [
    "หน้าแรก: เลือกชุดความรู้ (Knowledge) / เลือกบอท แล้วเริ่มถามได้ทันที",
    "แชทถาม-ตอบจากเอกสาร พร้อมการ์ดอ้างอิงแหล่งที่มาใต้คำตอบ",
    "ถามได้หลายประเด็นในข้อความเดียว เช่น ราคา ส่วนลด อำนาจอนุมัติ ตามเอกสาร",
    "แถบด้านข้าง: แชทใหม่, ค้นหาแชท, ดูประวัติแชท",
    "จัดการแชท: ปักหมุด / เปลี่ยนชื่อ / ลบ / จัดกลุ่มประวัติ (Pinned, Date, Latest)",
    "โหมดส่วนตัว: เปิดจากแถบด้านข้าง ใช้ /จำ และ /สั่ง รวมถึงจัดการ Memory",
    "โปรไฟล์ / ตั้งค่าบัญชี จากแถบด้านข้าง",
    "ในหน้าแชท: ให้ feedback 👍👎, ดูประกาศ, และคำถามแนะนำถัดไปใต้คำตอบ",
  ];
  return [
    "ฟีเจอร์ที่ใช้งานได้ในระบบผู้ใช้ (แถบด้านข้างและหน้าแชท) เช่น:",
    ...features.map((item) => `- ${item}`),
    "",
    "ถ้าต้องการดูเอกสารในชุดความรู้ที่เลือก ถามว่า \"มีเอกสารอะไรบ้าง\" ได้ครับ",
  ].join("\n");
};

export const getSystemCapabilityReply = (contextDocuments = [], message = "") => {
  // ถามเอกสารอย่างเดียว → รายชื่อไฟล์ครบ ไม่ปนฟีเจอร์
  if (isDocumentListQuery(message)) {
    return getDocumentListReply(contextDocuments);
  }
  // ถามฟีเจอร์อย่างเดียว → ไม่ปนรายการเอกสาร
  if (isSystemFeatureQuery(message)) {
    return getSystemFeatureReply();
  }
  // ถามกว้างๆ เช่น ถามอะไรได้บ้าง → ชี้ฟีเจอร์ฝั่ง User + รายการชุดความรู้
  return [
    getSystemFeatureReply(),
    "",
    getDocumentListReply(contextDocuments),
  ].join("\n");
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
