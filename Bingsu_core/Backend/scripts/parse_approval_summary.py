# -*- coding: utf-8 -*-
"""Parse คู่มือส่งเสริมการขาย Excel → JSON + SQL seed for ApprovalAuthorityRule."""
import glob
import hashlib
import json
import os
import re
import pandas as pd

DATA = "/data"
OUT_JSON = "/out/approval_authority_rules.json"
OUT_SQL = "/out/20260807000000_approval_authority_full_seed/migration.sql"

SECTION_SERVICE = {
    1: ("trial", "การทดลองใช้ผลิตภัณฑ์หรือบริการ"),
    2: ("corp_promo", "การยกเว้นหรือให้ส่วนลดค่าบริการ (ลูกค้าองค์กร)"),
    3: ("dark_fiber", "NT Dark Fiber"),
    4: ("iig", "NT IIG"),
    5: ("corporate", "NT Corporate Internet"),
    6: ("carrier_mpls", "NT Carrier Ethernet / NT MPLS"),
    7: ("corp_lite", "NT Corporate Internet Lite"),
    8: ("private_line", "NT Private Line"),
    9: ("sip_trunk", "NT SIP Trunk"),
    10: ("business_fixed", "NT Business Fixed Line"),
    11: ("cloud_pbx", "NT Cloud PBX / NT Mobile PBX"),
    12: ("digital_group", "ผลิตภัณฑ์และบริการกลุ่มดิจิทัล"),
    13: ("sat_transponder", "Satellite Transponder"),
    14: ("asiasat5", "AsiaSat 5"),
    15: ("inmarsat", "Inmarsat"),
    16: ("sat_tv", "Satellite TV Platform"),
    17: ("tv_tx", "NT TV Transmission"),
    18: ("vpbx", "Virtual PBX (V-PBX)"),
    19: ("ipl_border", "NT IPL Border"),
    20: ("ipl_border_60", "NT IPL Border (เพิ่มเติม 60 ปลายทาง)"),
    21: ("intl_eth_mpls_border", "NT International Ethernet/MPLS Border"),
    22: ("ipl_full", "NT IPL Full Circuit PoP-PoP"),
    23: ("intl_eth_mpls_full", "NT International Ethernet/MPLS Full Circuit"),
    24: ("thailand_ix", "Thailand IX"),
    25: ("isdn_pri_sip", "ISDN PRI / SIP Trunk"),
    26: ("other_misc", "อื่นๆ"),
}

ROLE_COLS = {3: "กจญ.", 4: "รจญ.", 5: "ชจญ.", 6: "ผจก.", 7: "ผส."}
ROLE_FULL = {
    "กจญ.": "กรรมการผู้จัดการใหญ่",
    "รจญ.": "รองกรรมการผู้จัดการใหญ่",
    "ชจญ.": "ผู้ช่วยกรรมการผู้จัดการใหญ่",
    "ผจก.": "ผู้จัดการ",
    "ผส.": "ผู้บริหารส่วนงาน",
}


def sql_str(v):
    if v is None:
        return "NULL"
    s = str(v).replace("'", "''")
    return f"'{s}'"


def sid(*parts):
    raw = "|".join(str(p) for p in parts)
    return "aa_" + hashlib.md5(raw.encode("utf-8")).hexdigest()[:16]


def pick_approver(row):
    marked = []
    for col, abbr in ROLE_COLS.items():
        v = row.iloc[col] if col < len(row) else None
        if pd.notna(v) and str(v).strip().upper() in ("P", "X", "✓", "✔"):
            marked.append(abbr)
    if len(marked) == 1:
        return marked[0]
    if len(marked) > 1:
        # lowest rank among marked (ผส < ผจก < ชจญ < รจญ < กจญ) — use first marked in hierarchy order
        order = ["ผส.", "ผจก.", "ชจญ.", "รจญ.", "กจญ."]
        for a in order:
            if a in marked:
                return a
    auth = str(row.iloc[8]) if len(row) > 8 and pd.notna(row.iloc[8]) else ""
    compact = auth.replace(" ", "")
    for abbr in ("กจญ.", "รจญ.", "ชจญ.", "ผจก.", "ผส."):
        if abbr.replace(".", "") in compact.replace(".", ""):
            return abbr
    return None


def parse_condition(label):
    t = str(label or "")

    m = re.search(r"ไม่เกิน\s*(\d+)\s*วัน", t)
    if m:
        d = int(m.group(1))
        return "trial_days", f"ทดลองใช้ไม่เกิน {d} วัน", None, None

    if re.search(r"เกิน\s*90\s*วัน", t):
        return "trial_days", "ทดลองใช้เกิน 90 วัน", None, None

    if re.search(r"เกินอำนาจอนุมัติตั้งแต่ในข้อ\s*1\.1", t):
        return "trial_days", "ทดลองใช้เกินอำนาจข้อ 1.1-1.3", None, None

    if re.search(r"เกินอัตรา.*[Ff]loor|[Ff]loor\s*[Pp]rice.*เกิน|เกิน.*[Ff]loor\s*[Pp]rice", t):
        return "over_floor", "ส่วนลดเกิน Floor Price", None, None

    if re.search(r"ไม่เกินอัตรา\s*[Ff]loor|ไม่เกิน.*[Ff]loor\s*[Pp]rice", t):
        return "to_floor", "ส่วนลดไม่เกิน Floor Price", None, None

    m = re.search(r"ไม่เกิน\s*ร้อยละ\s*(\d+(?:[.,]\d+)?)|ไม่เกิน\s*(\d+(?:[.,]\d+)?)\s*%", t)
    if m:
        pct = float((m.group(1) or m.group(2)).replace(",", "."))
        key = "pct_le_50" if pct == 50 else "pct_range"
        return key, t.strip()[:180], 0.0, pct

    m = re.search(r"มากกว่าร้อยละ\s*(\d+(?:[.,]\d+)?)", t)
    if m:
        pct = float(m.group(1).replace(",", "."))
        if re.search(r"[Ff]loor", t):
            return "pct_gt_50_floor", t.strip()[:180], pct, None
        return "pct_gt", t.strip()[:180], pct, None

    if re.search(r"ค่าติดตั้ง|ยกเว้นค่าติดตั้ง", t):
        return "install_waive", t.strip()[:180], None, None

    if re.search(r"มูลค่าสัญญา", t):
        return "contract_value", t.strip()[:180], None, None

    if re.search(r"CPE|IP Address|เปลี่ยนแปลงข้อตกลง|โซลูชั่น", t):
        return "other", t.strip()[:180], None, None

    return "other", (t.strip()[:180] or "อื่นๆ"), None, None


files = glob.glob(os.path.join(DATA, "*ตารางสรุป*"))
if not files:
    raise SystemExit("summary excel not found")
df = pd.read_excel(files[0], sheet_name="คู่มือส่งเสริมการขาย", header=None)

section_no = None
svc_key, svc_name = "general", "ทั่วไป"
rules = []
sort_by = {}

for i, row in df.iterrows():
    if i < 4:
        continue
    c0 = "" if pd.isna(row.iloc[0]) else str(row.iloc[0]).strip()
    c1 = "" if pd.isna(row.iloc[1]) else str(row.iloc[1]).strip()
    if not c0 and not c1:
        continue

    if c0 and re.match(r"^\d+$", c0):
        section_no = int(c0)
        svc_key, svc_name = SECTION_SERVICE.get(section_no, ("general", c1[:80] or "ทั่วไป"))
        continue

    if not c1:
        continue

    # skip pure group labels without numeric case id and without approver
    approver = pick_approver(row)
    if not approver:
        continue

    cond_key, cond_label, min_pct, max_pct = parse_condition(c1)
    note_parts = []
    if len(row) > 9 and pd.notna(row.iloc[9]):
        note_parts.append(str(row.iloc[9]).strip())
    if len(row) > 8 and pd.notna(row.iloc[8]):
        note_parts.append(str(row.iloc[8]).strip()[:220])
    note = " | ".join([p for p in note_parts if p])[:400] or None

    sort_by[svc_key] = sort_by.get(svc_key, 0) + 10
    rules.append({
        "id": sid(svc_key, section_no, c1, approver, i),
        "serviceKey": svc_key,
        "serviceName": svc_name,
        "conditionKey": cond_key,
        "conditionLabel": cond_label,
        "minPct": min_pct,
        "maxPct": max_pct,
        "approverAbbr": approver,
        "approverFull": ROLE_FULL.get(approver, ""),
        "note": note,
        "sortOrder": sort_by[svc_key],
        "active": True,
        "sourceRow": int(i),
        "sourceLabel": c1[:220],
        "sectionNo": section_no,
    })

seen = set()
uniq = []
for r in rules:
    if r["id"] in seen:
        continue
    seen.add(r["id"])
    uniq.append(r)

os.makedirs(os.path.dirname(OUT_SQL), exist_ok=True)
with open(OUT_JSON, "w", encoding="utf-8") as fh:
    json.dump(uniq, fh, ensure_ascii=False, indent=2)

lines = [
    "-- Full seed: อำนาจอนุมัติจากคู่มือส่งเสริมการขาย (ตารางสรุป)",
    "-- ลบของเดิมแล้วใส่ชุดใหม่ทั้งหมด",
    'DELETE FROM "ApprovalAuthorityRule";',
    "",
    'INSERT INTO "ApprovalAuthorityRule"',
    '  ("id","serviceKey","serviceName","conditionKey","conditionLabel","minPct","maxPct","approverAbbr","approverFull","note","sortOrder","active","createdAt","updatedAt")',
    "VALUES",
]
value_rows = []
for r in uniq:
    value_rows.append(
        "  ("
        + ", ".join([
            sql_str(r["id"]),
            sql_str(r["serviceKey"]),
            sql_str(r["serviceName"]),
            sql_str(r["conditionKey"]),
            sql_str(r["conditionLabel"]),
            "NULL" if r["minPct"] is None else str(r["minPct"]),
            "NULL" if r["maxPct"] is None else str(r["maxPct"]),
            sql_str(r["approverAbbr"]),
            sql_str(r["approverFull"]),
            sql_str(r["note"]),
            str(int(r["sortOrder"])),
            "true",
            "CURRENT_TIMESTAMP",
            "CURRENT_TIMESTAMP",
        ])
        + ")"
    )
lines.append(",\n".join(value_rows) + ";\n")
with open(OUT_SQL, "w", encoding="utf-8") as fh:
    fh.write("\n".join(lines))

from collections import Counter
c = Counter(r["serviceKey"] for r in uniq)
print("TOTAL", len(uniq))
for k, n in c.most_common():
    print(f"  {k}: {n}")
print("Wrote", OUT_JSON)
print("Wrote", OUT_SQL)
