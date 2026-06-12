#!/usr/bin/env python3
"""
ดึงข้อความจาก PDF ด้วย pdfplumber (text layer เท่านั้น)
ส่งออกบรรทัดแรก: PAGES:<จำนวนหน้า> แล้วตามด้วยข้อความรวมทุกหน้า
ใช้ร่วมกับ Node (uploadQueue.extractPdfTextWithPlumber)
"""
from __future__ import annotations

import sys


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: extract_pdf_plumber.py <path-to.pdf>", file=sys.stderr)
        sys.exit(2)
    path = sys.argv[1]
    import pdfplumber

    merged_parts: list[str] = []
    with pdfplumber.open(path) as pdf:
        n = len(pdf.pages)
        for page in pdf.pages:
            text = (page.extract_text() or "").strip()
            if text:
                merged_parts.append(text)
        merged = "\n\n".join(merged_parts).strip()
    print(f"PAGES:{n}")
    print(merged)


if __name__ == "__main__":
    # รองรับการส่ง path ผ่าน stdin ไม่ใช้ — ใช้ path จาก argv เท่านั้น
    main()
