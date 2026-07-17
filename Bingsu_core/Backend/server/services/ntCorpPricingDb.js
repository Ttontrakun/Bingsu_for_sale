// เครื่องคำนวณราคา/ส่วนลด/อำนาจอนุมัติ NT Corporate Internet และ Lite (deterministic)
// อ่าน "อัตราค่าบริการ" จากตาราง ServiceRate ใน DB (แก้ไขได้ผ่านหน้า admin) — ตรรกะการคำนวณอยู่ในโค้ด (ไม่เปลี่ยน)
// ราคาปกติรายเดือน = อัตรา International Bandwidth + อัตรา Local Access
// ที่มา (นโยบายอำนาจอนุมัติ): บันทึก เอ็นที สทค.(อสทค.)/463 ลว. 24 มิ.ย. 2569

import { prisma } from "../db.js";

const fmt = (n) => Number(n).toLocaleString("en-US");
const ORDER = "บันทึก เอ็นที สทค.(อสทค.)/463 ลว. 24 มิถุนายน 2569";
const normalize = (s) => String(s || "").toLowerCase();

// ---- โหลดอัตราจาก DB (cache สั้นๆ กันยิง DB ทุกคำถาม) ----
let rateCache = { data: null, expiresAt: 0 };
const RATE_TTL_MS = 60 * 1000;

const loadRates = async () => {
  if (rateCache.data && Date.now() < rateCache.expiresAt) return rateCache.data;
  try {
    const rows = await prisma.serviceRate.findMany({
      select: { service: true, kind: true, speed: true, rate: true },
    });
    const data = { corp: { intl: {}, local: {} }, lite: { intl: {}, local: {} } };
    rows.forEach((r) => {
      const svc = r.service === "lite" ? "lite" : "corp";
      const kind = r.kind === "local" ? "local" : "intl";
      if (Number.isFinite(r.speed) && Number.isFinite(r.rate)) data[svc][kind][r.speed] = r.rate;
    });
    // ถ้ายังไม่มีข้อมูล (ยังไม่ migrate/seed) → คืน null เพื่อให้ข้ามไปใช้ RAG
    const hasAny = rows.length > 0;
    rateCache = { data: hasAny ? data : null, expiresAt: Date.now() + RATE_TTL_MS };
    return rateCache.data;
  } catch (err) {
    return rateCache.data; // DB ล่ม/ตารางยังไม่มี → ใช้ค่าเดิม (อาจเป็น null) ไม่ให้ RAG พัง
  }
};

// เผื่อ admin แก้อัตราแล้วอยากให้มีผลทันที (ล้าง cache)
export const invalidateRateCache = () => { rateCache = { data: null, expiresAt: 0 }; };

// ---- parser ----
const mentionsCorpInternet = (m) =>
  /(corporate\s*internet|คอร์ปอเรท\s*อินเทอร์เน็ต|nt\s*corporate)/.test(m);
const isLite = (m) => /lite|ไลท์/.test(m);

const extractOfferedPrice = (raw) => {
  const text = String(raw || "");
  const m1 = text.match(/(?:เสนอ(?:ขาย)?|ราคาขาย|ขายที่)[^\d]{0,12}([\d,]{4,})(?:\.\d+)?/);
  if (m1) return Number(m1[1].replace(/,/g, ""));
  const m2 = text.match(/([\d,]{4,})(?:\.\d+)?\s*บาท/);
  if (m2) return Number(m2[1].replace(/,/g, ""));
  return null;
};

const toNum = (s) => Number(String(s).replace(/,/g, ""));

const extractSpeeds = (raw) => {
  const m = normalize(String(raw || ""));
  const slash = m.match(/([\d,]{2,7})\s*\/\s*([\d,]{2,7})/);
  if (slash) {
    const a = toNum(slash[1]);
    const b = toNum(slash[2]);
    if (a >= 1 && a <= 10000 && b >= 1 && b <= 10000) return { intl: a, la: b };
  }
  const intlM = m.match(/(?:international|inter|อินเตอร์|อินเตอร์เนชั่นแนล)[^\d]{0,10}([\d,]{2,7})/);
  const laM = m.match(/(?:local\s*access|local|โลคอล|โลคัล)[^\d]{0,10}([\d,]{2,7})/);
  if (intlM && laM) return { intl: toNum(intlM[1]), la: toNum(laM[1]) };
  if (intlM) {
    const intl = toNum(intlM[1]);
    const nums = (m.match(/[\d,]{2,7}/g) || []).map(toNum).filter((n) => n >= 1 && n <= 10000);
    const other = nums.find((n) => n !== intl);
    if (other) return { intl, la: other };
    return { intl, la: intl };
  }
  const speedNums = (m.match(/([\d,]{2,7})\s*(?:mbps|เมกะ|เมก)/g) || [])
    .map((s) => toNum(s.replace(/[^\d,]/g, "")))
    .filter((n) => n >= 1 && n <= 10000);
  if (speedNums.length >= 2) return { intl: speedNums[0], la: speedNums[1] };
  if (speedNums.length === 1) return { intl: speedNums[0], la: speedNums[0] };
  return null;
};

const discountAuthorityByPct = (pct) => {
  if (pct <= 30) {
    return "อยู่ในอำนาจของ ผจก. (ผู้จัดการฝ่าย) — ข้อ 2.1 (ส่วนลดไม่เกิน 30% จากอัตราปกติ)";
  }
  return "เกิน 30% จากอัตราปกติ จึงไม่ใช่อำนาจ ผจก. — ต้องเทียบกับ Floor Price: ถ้าราคาที่เสนอไม่ต่ำกว่า Floor Price → อยู่ในอำนาจของ ชจญ. (ข้อ 2.2); ถ้าต่ำกว่า Floor Price → อยู่ในอำนาจของ รจญ. ผ่าน ชจญ., ผจก.สทค. (ข้อ 2.3)";
};

/**
 * ตอบคำถามราคา/ส่วนลด NT Corporate Internet แบบ deterministic (อ่านอัตราจาก DB)
 * async — คืน string ถ้าจับคู่ได้ / คืน null ถ้าไม่ใช่คำถามแนวนี้ หรือไม่มีอัตราในตาราง (ให้ RAG ทำต่อ)
 */
export async function getNtCorpInternetPricingReply(message) {
  const raw = String(message || "");
  const m = normalize(raw);
  if (!mentionsCorpInternet(m)) return null;

  const speeds = extractSpeeds(raw);
  if (!speeds) return null;

  const hasExplicitBoth =
    /(?:international|inter|อินเตอร์)/.test(m) && /(?:local\s*access|local|โลคอล|โลคัล)/.test(m);
  // ถือเป็นคำถามเชิงราคาเมื่อ: มีคำบอกราคา/ส่วนลด, ระบุ international+local, ให้ราคาเสนอ,
  // หรือระบุ "ความเร็ว/Mbps/รูปแบบ X/X" คู่กับชื่อบริการ (เช่น "NT Corporate Internet 800/800 Mbps")
  const priceIntent =
    /(ราคา|price|ค่าบริการ|ส่วนลด|เสนอ|กี่บาท|เท่าไหร่|ความเร็ว|mbps|เมกะ|เมก)/.test(m)
    || hasExplicitBoth
    || /[\d,]{1,7}\s*\/\s*[\d,]{1,7}/.test(m)
    || extractOfferedPrice(raw) != null;
  if (!priceIntent) return null;

  const rates = await loadRates();
  if (!rates) return null;

  const lite = isLite(m);
  const svcKey = lite ? "lite" : "corp";
  const svc = lite ? "NT Corporate Internet Lite" : "NT Corporate Internet";
  const intlRate = rates[svcKey].intl[speeds.intl];
  const laRate = rates[svcKey].local[speeds.la];
  if (intlRate == null || laRate == null) return null; // ความเร็วไม่อยู่ในตาราง → ให้ RAG ต่อ

  const normal = intlRate + laRate;
  const head = `${svc} — International ${fmt(speeds.intl)} Mbps / Local Access ${fmt(speeds.la)} Mbps`;
  const priceLine = `ราคาปกติ (Price List) = ${fmt(intlRate)} + ${fmt(laRate)} = **${fmt(normal)} บาท/หน่วย/เดือน** (ยังไม่รวม VAT)`;

  const offered = extractOfferedPrice(raw);
  if (offered == null) {
    return `${head}\n${priceLine}`;
  }
  const discount = normal - offered;
  if (discount <= 0) {
    return `${head}\nราคาปกติ = ${fmt(normal)} บาท, ราคาที่เสนอ = ${fmt(offered)} บาท\nราคาที่เสนอไม่ต่ำกว่าราคาปกติ จึงไม่ถือเป็นส่วนลด (ส่วนลด = 0 บาท / 0%)`;
  }
  const pct = (discount / normal) * 100;
  return [
    head,
    `ราคาปกติ = ${fmt(normal)} บาท/หน่วย/เดือน (${fmt(intlRate)} + ${fmt(laRate)})`,
    `ราคาที่เสนอ = ${fmt(offered)} บาท/หน่วย/เดือน`,
    `ส่วนลด = ${fmt(normal)} − ${fmt(offered)} = **${fmt(discount)} บาท**`,
    `คิดเป็นส่วนลด = ${fmt(discount)} ÷ ${fmt(normal)} × 100 = **${pct.toFixed(2)}%**`,
    `อำนาจอนุมัติ: ${discountAuthorityByPct(pct)}`,
    `ตาม ${ORDER}`,
  ].join("\n");
}
