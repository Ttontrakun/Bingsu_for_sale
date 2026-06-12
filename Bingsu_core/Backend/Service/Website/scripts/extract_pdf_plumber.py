"""
ดึงข้อความจาก PDF ด้วย pdfplumber (สำหรับ PDF ที่มี text layer)
ใช้เมื่อ PDF ดึง text ได้โดยตรง — ไม่ต้องใช้ OCR

Usage:
  python extract_pdf_plumber.py <path-to-pdf>
  # อ่านข้อความทั้งหมดจาก PDF แล้วพิมพ์ออก stdout (UTF-8)

ถ้า PDF เป็นสแกน (ไม่มี text layer) ข้อความที่ได้จะน้อยหรือว่าง — ฝั่ง Node จะใช้ Typhoon OCR แทน
"""
from __future__ import annotations

import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python extract_pdf_plumber.py <path-to-pdf>", file=sys.stderr)
        sys.exit(1)
    path = Path(sys.argv[1]).resolve()
    if not path.is_file():
        print(f"File not found: {path}", file=sys.stderr)
        sys.exit(1)

    try:
        import pdfplumber
    except ImportError:
        print("pip install pdfplumber", file=sys.stderr)
        sys.exit(1)

    parts: list[str] = []
    with pdfplumber.open(path) as pdf:
        n = len(pdf.pages)
        print(f"PAGES:{n}", flush=True)
        for page in pdf.pages:
            text = page.extract_text()
            if text and text.strip():
                parts.append(text.strip())
    print("\n\n".join(parts), end="")


if __name__ == "__main__":
    main()
