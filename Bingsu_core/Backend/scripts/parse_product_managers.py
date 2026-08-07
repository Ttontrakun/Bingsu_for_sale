# -*- coding: utf-8 -*-
"""Parse Super PM / Product Manager Excel (โครงสร้างใหม่) → JSON + SQL seed."""
import glob
import hashlib
import json
import os
import re
import pandas as pd

DATA = "/data"
OUT_JSON = "/out/product_manager_entries.json"
OUT_SQL = "/out/20260807010000_product_manager_entry/migration.sql"

SERVICE_KEY_MAP = [
    (r"dark\s*fiber|เส้นใยแก้วนำแสง", "dark_fiber"),
    (r"\biig\b|internet\s*gateway", "iig"),
    (r"carrier\s*ethernet|mpls|datacom|สื่อสารข้อมูล", "carrier_mpls"),
    (r"corporate\s*internet\s*lite", "corp_lite"),
    (r"corporate|connectivity", "corporate"),
    (r"private\s*line", "private_line"),
    (r"sip\s*trunk", "sip_trunk"),
    (r"cloud\s*pbx|mobile\s*pbx", "cloud_pbx"),
    (r"contact\s*center", "contact_center"),
    (r"data\s*center|\bix\b", "data_center"),
    (r"cloud|big\s*data", "cloud_bigdata"),
    (r"cybersecurity|cctv", "cybersecurity"),
    (r"satellite", "satellite"),
    (r"5g", "mobile_5g"),
    (r"trunk\s*radio", "trunk_radio"),
    (r"mobile\s*retail", "mobile_retail"),
    (r"internet\s*retail", "internet_retail"),
    (r"fixed\s*line", "fixed_line"),
    (r"idd", "idd"),
    (r"ท่อร้อยสาย|neutral\s*last\s*mile", "duct_nlm"),
    (r"เสาโทรคมนาคม", "tower"),
    (r"พัฒนาสินทรัพย์", "asset_dev"),
]


def sql_str(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return "NULL"
    s = str(v).replace("'", "''")
    return f"'{s}'"


def sid(*parts):
    return "pm_" + hashlib.md5("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()[:16]


def clean(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    return re.sub(r"\s+", " ", str(v).replace("\n", " ")).strip()


def split_name_title(cell):
    """'ตำแหน่ง | (ชื่อ)' or multi-line → title, name"""
    t = clean(cell)
    if not t:
        return "", ""
    m = re.search(r"\(([^)]+)\)", t)
    name = m.group(1).strip() if m else ""
    title = re.sub(r"\([^)]*\)", "", t).strip(" |")
    return title, name


def detect_service_key(service_group):
    blob = service_group or ""
    for pat, key in SERVICE_KEY_MAP:
        if re.search(pat, blob, re.I):
            return key
    return None


files = sorted(glob.glob(os.path.join(DATA, "*โครงสร้างใหม่*")))
if not files:
    files = sorted(glob.glob(os.path.join(DATA, "*Super Product Manager*")))
if not files:
    raise SystemExit("SPM excel not found")

# Prefer โครงสร้างใหม่
pref = [f for f in files if "โครงสร้างใหม่" in os.path.basename(f)]
f = pref[0] if pref else files[0]
print("FILE:", os.path.basename(f))
xl = pd.ExcelFile(f)
sheet = xl.sheet_names[0]
df = pd.read_excel(f, sheet_name=sheet, header=None)
print("SHEET:", sheet, df.shape)

entries = []
biz = ""
sort_i = 0
for i, row in df.iterrows():
    if i < 3:
        continue
    c0 = clean(row.iloc[0]) if len(row) > 0 else ""
    c1 = clean(row.iloc[1]) if len(row) > 1 else ""
    c2 = clean(row.iloc[2]) if len(row) > 2 else ""
    c3 = clean(row.iloc[3]) if len(row) > 3 else ""
    c4 = clean(row.iloc[4]) if len(row) > 4 else ""
    c5 = clean(row.iloc[5]) if len(row) > 5 else ""

    if c0 and not c2 and not c4:
        # group header row
        biz = c0
        continue
    if not c1 and not c2 and not c4:
        continue
    if c0:
        biz = c0

    # skip empty service rows
    if not c1 or c1 in ("All",):
        continue

    spm_title, spm_name = split_name_title(c2)
    pm_title, pm_name = split_name_title(c4)
    if not spm_name and not pm_name and not c3 and not c5:
        continue

    sort_i += 10
    entries.append({
        "id": sid(biz, c1, c3, c5, i),
        "businessGroup": biz or "อื่นๆ",
        "serviceGroup": c1,
        "serviceKey": detect_service_key(c1),
        "superPmName": spm_name or None,
        "superPmTitle": spm_title or None,
        "superPmAbbr": c3 or None,
        "pmName": pm_name or None,
        "pmTitle": pm_title or None,
        "pmAbbr": c5 or None,
        "sortOrder": sort_i,
        "active": True,
        "sourceRow": int(i),
    })

os.makedirs(os.path.dirname(OUT_SQL), exist_ok=True)
with open(OUT_JSON, "w", encoding="utf-8") as fh:
    json.dump(entries, fh, ensure_ascii=False, indent=2)

lines = [
    "-- ProductManagerEntry: Super PM / Product Manager (โครงสร้างใหม่)",
    'CREATE TABLE IF NOT EXISTS "ProductManagerEntry" (',
    '    "id" TEXT NOT NULL,',
    '    "businessGroup" TEXT NOT NULL,',
    '    "serviceGroup" TEXT NOT NULL,',
    '    "serviceKey" TEXT,',
    '    "superPmName" TEXT,',
    '    "superPmTitle" TEXT,',
    '    "superPmAbbr" TEXT,',
    '    "pmName" TEXT,',
    '    "pmTitle" TEXT,',
    '    "pmAbbr" TEXT,',
    '    "sortOrder" INTEGER NOT NULL DEFAULT 0,',
    '    "active" BOOLEAN NOT NULL DEFAULT true,',
    '    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
    '    "updatedAt" TIMESTAMP(3) NOT NULL,',
    '    CONSTRAINT "ProductManagerEntry_pkey" PRIMARY KEY ("id")',
    ");",
    "",
    'CREATE INDEX IF NOT EXISTS "ProductManagerEntry_serviceKey_active_idx" ON "ProductManagerEntry"("serviceKey", "active");',
    'CREATE INDEX IF NOT EXISTS "ProductManagerEntry_businessGroup_idx" ON "ProductManagerEntry"("businessGroup");',
    "",
    'DELETE FROM "ProductManagerEntry";',
    "",
    'INSERT INTO "ProductManagerEntry"',
    '  ("id","businessGroup","serviceGroup","serviceKey","superPmName","superPmTitle","superPmAbbr","pmName","pmTitle","pmAbbr","sortOrder","active","createdAt","updatedAt")',
    "VALUES",
]
vals = []
for e in entries:
    vals.append(
        "  ("
        + ", ".join([
            sql_str(e["id"]),
            sql_str(e["businessGroup"]),
            sql_str(e["serviceGroup"]),
            sql_str(e["serviceKey"]),
            sql_str(e["superPmName"]),
            sql_str(e["superPmTitle"]),
            sql_str(e["superPmAbbr"]),
            sql_str(e["pmName"]),
            sql_str(e["pmTitle"]),
            sql_str(e["pmAbbr"]),
            str(int(e["sortOrder"])),
            "true",
            "CURRENT_TIMESTAMP",
            "CURRENT_TIMESTAMP",
        ])
        + ")"
    )
lines.append(",\n".join(vals) + ";\n")
with open(OUT_SQL, "w", encoding="utf-8") as fh:
    fh.write("\n".join(lines))

print("TOTAL", len(entries))
print("Wrote", OUT_JSON)
print("Wrote", OUT_SQL)
