#!/usr/bin/env python3
"""
ดึงข้อความจาก PDF ด้วย pdfplumber (text layer เท่านั้น)
ส่งออกบรรทัดแรก: PAGES:<จำนวนหน้า>
จากนั้นแบ่งเนื้อหาเป็นรายหน้าด้วยบรรทัดคั่น ===PLUMBER_PAGE:<เลขหน้า>===
(ฝั่ง Node ใช้เลขหน้าเพื่อแยกว่าหน้าไหนมี text layer หน้าไหนเป็นภาพสแกนที่ต้อง OCR)
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

    parts: list[str] = []
    with pdfplumber.open(path) as pdf:
        n = len(pdf.pages)
        for index, page in enumerate(pdf.pages, start=1):
            text = (page.extract_text() or "").strip()
            # ใส่หัวหน้าทุกหน้าแม้ข้อความว่าง เพื่อให้ฝั่ง Node รู้ว่าหน้านั้นดึงอะไรไม่ได้
            parts.append(f"===PLUMBER_PAGE:{index}===")
            if text:
                parts.append(text)
    print(f"PAGES:{n}")
    print("\n".join(parts))


if __name__ == "__main__":
    # รองรับการส่ง path ผ่าน stdin ไม่ใช้ — ใช้ path จาก argv เท่านั้น
    main()
