/**
 * Structured lookup ตารางอำนาจอนุมัติ (ApprovalAuthorityRule)
 * ใช้ตอบคำถาม "ใครอนุมัติ / ตำแหน่งนี้ได้อนุมัติไหม" ก่อน hardcode/RAG
 */
import { prisma } from "../db.js";
import {
  normalizeText,
  formatAuthorityRole,
  AUTHORITY_ROLE_MAP,
  isAuthorityDecisionQuery,
  isAuthorityRoleConfirmQuery,
} from "./chat/queryClassifiers.js";

let ruleCache = { data: null, expiresAt: 0 };
const RULE_TTL_MS = 60 * 1000;

export const invalidateApprovalAuthorityCache = () => {
  ruleCache = { data: null, expiresAt: 0 };
};

const loadRules = async () => {
  if (ruleCache.data && Date.now() < ruleCache.expiresAt) return ruleCache.data;
  try {
    const rows = await prisma.approvalAuthorityRule.findMany({
      where: { active: true },
      orderBy: [{ serviceKey: "asc" }, { sortOrder: "asc" }],
    });
    ruleCache = { data: rows, expiresAt: Date.now() + RULE_TTL_MS };
    return rows;
  } catch (err) {
    console.warn("[approvalAuthority] loadRules failed:", err?.message || err);
    return ruleCache.data || [];
  }
};

const detectServiceKey = (m) => {
  // ลำดับสำคัญ: ชื่อเฉพาะก่อนชื่อกว้าง
  if (/(corporate\s*internet\s*lite|corp\s*lite)/.test(m)) return "corp_lite";
  if (/(nt\s*dark\s*fiber|dark\s*fiber|เส้นใยแก้วนำแสง)/.test(m)) return "dark_fiber";
  if (/\biig\b|อินเตอร์เน็ตเกตเวย์|อินเทอร์เน็ตเกตเวย์/.test(m)) return "iig";
  if (/(carrier\s*ethernet|nt\s*mpls|\bmpls\b)/.test(m)) return "carrier_mpls";
  if (/(private\s*line|nt\s*pl\b)/.test(m)) return "private_line";
  if (/(sip\s*trunk)/.test(m)) return "sip_trunk";
  if (/(business\s*fixed|fixed\s*line\s*ธุรกิจ)/.test(m)) return "business_fixed";
  if (/(cloud\s*pbx|mobile\s*pbx|v-?pbx|virtual\s*pbx)/.test(m)) return "cloud_pbx";
  if (/(thailand\s*ix|\btix\b)/.test(m)) return "thailand_ix";
  if (/(inmarsat)/.test(m)) return "inmarsat";
  if (/(asiasat)/.test(m)) return "asiasat5";
  if (/(satellite\s*tv|sat\s*tv)/.test(m)) return "sat_tv";
  if (/(transponder|ช่องสัญญาณดาวเทียม)/.test(m)) return "sat_transponder";
  if (/(tv\s*transmission|ถ่ายทอดโทรทัศน์)/.test(m)) return "tv_tx";
  if (/(international\s*ethernet|international\s*mpls|ipl\s*full|full\s*circuit)/.test(m)) {
    if (/border|ชายแดน/.test(m)) return "intl_eth_mpls_border";
    return "intl_eth_mpls_full";
  }
  if (/(international\s*private\s*line|nt\s*ipl|\bipl\b)/.test(m)) {
    if (/60\s*ปลายทาง/.test(m)) return "ipl_border_60";
    if (/border|ชายแดน/.test(m)) return "ipl_border";
    return "ipl_full";
  }
  if (/(isdn|pri)/.test(m)) return "isdn_pri_sip";
  if (/(ทดลองใช้|trial)/.test(m)) return "trial";
  if (/(nt\s*corporate|corporate\s*internet)/.test(m)) return "corporate";
  if (/(กลุ่มดิจิทัล|digital\s*group)/.test(m)) return "digital_group";
  return null;
};

const extractPct = (raw) => {
  const text = String(raw || "");
  const m1 = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (m1) return Number(String(m1[1]).replace(",", "."));
  const m2 = text.match(/ร้อยละ\s*(\d+(?:[.,]\d+)?)/i);
  if (m2) return Number(String(m2[1]).replace(",", "."));
  return null;
};

const mentionsOverFloor = (m) =>
  /(เกิน\s*floor|ต่ำกว่า\s*floor|เกินราคาขั้นต่ำ|ต่ำกว่าราคาขั้นต่ำ|เกิน\s*floor\s*price|over\s*floor)/i.test(m);

const mentionsToFloorBand = (m) =>
  /(ไม่เกิน\s*floor|ถึง\s*floor|จนถึง\s*floor|ไม่เกินราคาขั้นต่ำ|ฟลอร์\s*ไพรซ์)/i.test(m)
  || (/(มากกว่า|เกิน|มากกว่าร้อยละ)/.test(m) && /(50|ร้อยละ\s*50)/.test(m));

const pickRule = (rules, { pct, overFloor, toFloorBand }) => {
  if (!rules?.length) return null;
  if (overFloor) {
    return rules.find((r) => r.conditionKey === "over_floor") || null;
  }
  if (toFloorBand) {
    return rules.find((r) => r.conditionKey === "to_floor")
      || rules.find((r) => r.conditionKey === "pct_gt_50_floor")
      || null;
  }
  if (pct != null && pct > 50) {
    const gt50 = rules.find((r) => r.conditionKey === "pct_gt_50_floor");
    if (gt50) return gt50;
  }
  if (pct != null) {
    const byRange = rules.find((r) => {
      if (["over_floor", "to_floor", "trial_days", "install_waive", "contract_value"].includes(r.conditionKey)) {
        return false;
      }
      const min = r.minPct == null ? -Infinity : Number(r.minPct);
      const max = r.maxPct == null ? Infinity : Number(r.maxPct);
      return pct >= min && pct <= max;
    });
    if (byRange) return byRange;
    if (pct <= 50) {
      return rules.find((r) => r.conditionKey === "pct_le_50")
        || rules.find((r) => r.conditionKey === "pct_range" && Number(r.maxPct) >= pct)
        || null;
    }
  }
  // ไม่มี % ชัด → คืนช่วง % หลักของบริการ ถ้ามี
  return rules.find((r) => r.conditionKey === "pct_le_50")
    || rules.find((r) => r.conditionKey === "pct_range")
    || rules.find((r) => r.conditionKey === "to_floor")
    || rules[0]
    || null;
};

const formatRuleReply = (rule, { asWho = true } = {}) => {
  const approver = formatAuthorityRole(rule.approverAbbr || rule.approverFull || "");
  const cond = rule.conditionLabel || rule.conditionKey;
  const lines = asWho
    ? [`ผู้อนุมัติ: ${approver}`]
    : [`ได้ครับ — ผู้อนุมัติในกรณีนี้คือ ${approver}`];
  if (cond) lines.push(`เงื่อนไข: ${cond}`);
  if (rule.note) lines.push(`หมายเหตุ: ${rule.note}`);
  if (rule.serviceName) lines.push(`บริการ: ${rule.serviceName}`);
  return lines.join("\n");
};

const formatRoleConfirmReply = (rule, askedAbbr) => {
  const asked = AUTHORITY_ROLE_MAP.find((e) => e.abbr === askedAbbr) || AUTHORITY_ROLE_MAP.find((e) => e.re.test(askedAbbr));
  const approverLabel = formatAuthorityRole(rule.approverAbbr);
  const isMatch = asked ? asked.re.test(rule.approverAbbr) : false;
  if (isMatch) {
    return [
      `ได้ครับ — ผู้อนุมัติในกรณีนี้คือ ${approverLabel}`,
      rule.conditionLabel ? `เงื่อนไข: ${rule.conditionLabel}` : null,
      rule.note ? `หมายเหตุ: ${rule.note}` : null,
      rule.serviceName ? `บริการ: ${rule.serviceName}` : null,
    ].filter(Boolean).join("\n");
  }
  return [
    `ตามเอกสาร ${formatAuthorityRole(asked?.abbr || askedAbbr)} ไม่ใช่ผู้อนุมัติในกรณีนี้`,
    `ผู้อนุมัติ: ${approverLabel}`,
    rule.conditionLabel ? `เงื่อนไข: ${rule.conditionLabel}` : null,
    rule.note ? `หมายเหตุ: ${rule.note}` : null,
    rule.serviceName ? `บริการ: ${rule.serviceName}` : null,
  ].filter(Boolean).join("\n");
};

/**
 * ตอบจากตารางอำนาจอนุมัติ — คืน string หรือ null (ให้ path อื่นทำต่อ)
 */
export async function getApprovalAuthorityReply(message) {
  const raw = String(message || "").trim();
  if (!raw) return null;
  const m = normalizeText(raw);

  const isAuthQ = isAuthorityDecisionQuery(m) || isAuthorityRoleConfirmQuery(m);
  if (!isAuthQ) return null;

  const serviceKey = detectServiceKey(m);
  // ต้องระบุบริการชัด — กันตอบผิดบริการ
  if (!serviceKey) return null;

  const rulesAll = await loadRules();
  const rules = (rulesAll || []).filter((r) => r.serviceKey === serviceKey && r.active !== false);
  if (rules.length === 0) return null;

  const pct = extractPct(raw);
  const overFloor = mentionsOverFloor(m);
  const toFloorBand = mentionsToFloorBand(m) && !overFloor;

  // คำถามยืนยันบทบาทต้องมี % หรือ floor / หรือมีเงื่อนไขชัด — ถ้ามีแค่ชื่อตำแหน่ง+บริการ ยังตอบช่วงหลักได้เมื่อมีได้ไหม
  const rule = pickRule(rules, { pct, overFloor, toFloorBand });
  if (!rule) return null;

  if (isAuthorityRoleConfirmQuery(m)) {
    const asked = AUTHORITY_ROLE_MAP.find((entry) => entry.re.test(m));
    if (!asked) return formatRuleReply(rule, { asWho: true });
    // ถ้าไม่มี % และไม่ใช่ floor — ยังตอบเทียบกับ rule ที่เลือกได้ (เช่น ถาม 60% จะเข้า gt50)
    if (pct == null && !overFloor && !toFloorBand) {
      // ไม่มีตัวเลข: บอกว่าขึ้นกับช่วงส่วนลด แล้วสรุป rule ที่พบบ่อย
      const bands = rules
        .filter((r) => r.conditionKey !== "other")
        .map((r) => `- ${r.conditionLabel || r.conditionKey}: ${formatAuthorityRole(r.approverAbbr)}`)
        .join("\n");
      const matchAny = rules.some((r) => asked.re.test(r.approverAbbr));
      if (!matchAny) {
        return [
          `ตามเอกสาร ${formatAuthorityRole(asked.abbr)} ไม่ได้เป็นผู้อนุมัติทุกกรณีของ ${rules[0].serviceName}`,
          "อำนาจแบ่งตามเงื่อนไขดังนี้:",
          bands,
        ].join("\n");
      }
      return [
        `${formatAuthorityRole(asked.abbr)} มีอำนาจในบางเงื่อนไขของ ${rules[0].serviceName} ดังนี้:`,
        bands,
        "ระบุเปอร์เซ็นต์ส่วนลดหรือเงื่อนไข Floor Price จะชี้ผู้อนุมัติที่ตรงเคสได้ชัดขึ้น",
      ].join("\n");
    }
    return formatRoleConfirmReply(rule, asked.abbr);
  }

  // ใครอนุมัติ — ถ้าไม่มี % ให้ลิสต์ช่วง
  if (pct == null && !overFloor && !toFloorBand && /(ใครอนุมัติ|ใครมีอำนาจ|ผู้อนุมัติ)/.test(m)) {
    const bands = rules.map((r) => {
      const ap = formatAuthorityRole(r.approverAbbr);
      return `- ${r.conditionLabel || r.conditionKey}: ${ap}`;
    });
    return [`ผู้อนุมัติ ${rules[0].serviceName} แบ่งตามเงื่อนไข:`, ...bands].join("\n");
  }

  return formatRuleReply(rule, { asWho: true });
}
