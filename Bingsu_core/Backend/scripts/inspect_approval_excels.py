# -*- coding: utf-8 -*-
import os
import glob
import pandas as pd

DATA = "/data"
patterns = [
    "*Super Product Manager*",
    "*ตารางสรุป*",
    "*คู่มือการใช้ระเบียบ*",
]

files = []
for p in patterns:
    files.extend(glob.glob(os.path.join(DATA, p)))
files = sorted(set(files))

if not files:
    print("No matching xlsx. Listing all:")
    for name in sorted(os.listdir(DATA)):
        if name.lower().endswith(".xlsx"):
            print(" -", name)
    raise SystemExit(1)

for f in files:
    print("=" * 90)
    print("FILE:", os.path.basename(f))
    xl = pd.ExcelFile(f)
    print("SHEETS:", xl.sheet_names)
    for s in xl.sheet_names:
        df = pd.read_excel(f, sheet_name=s, header=None)
        print(f"--- sheet: {s!r} shape={df.shape}")
        for i, row in df.head(60).iterrows():
            vals = []
            for v in row.tolist()[:14]:
                if pd.isna(v):
                    vals.append("")
                else:
                    t = str(v).replace("\n", " | ")
                    vals.append(t[:90])
            if any(vals):
                print(f"{i:02d}| " + " || ".join(vals))
        print()
