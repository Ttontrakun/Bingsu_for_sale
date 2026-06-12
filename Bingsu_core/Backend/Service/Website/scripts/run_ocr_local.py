"""
รัน PaddleOCR กับไฟล์ PDF โดยตรง (ไม่ใช้ Docker / ไม่ต้องเปิด API)
ใช้ดูความเร็วและตัวอย่างข้อความที่ได้

Usage (จากโฟลเดอร์ askaa_backend):
  python backend/scripts/run_ocr_local.py <path-to-pdf> [จำนวนหน้า]
  # จำนวนหน้า ถ้าไม่ใส่ = 1 หน้า (รวดเร็ว)

ตัวอย่าง:
  python backend/scripts/run_ocr_local.py document.pdf
  python backend/scripts/run_ocr_local.py document.pdf 5
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python backend/scripts/run_ocr_local.py <path-to-pdf> [จำนวนหน้า]")
        sys.exit(1)
    path = Path(sys.argv[1]).resolve()
    if not path.is_file():
        print("File not found:", path)
        sys.exit(1)
    max_pages_arg = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 1

    try:
        from paddleocr import PaddleOCR
        import numpy as np
        import fitz
        from PIL import Image
    except ImportError as e:
        print("ติดตั้งก่อน: pip install -r backend/requirements.txt")
        raise SystemExit(1) from e

    lang = "th"
    use_angle_cls = True
    dpi = 200
    max_pages = max(1, min(max_pages_arg, 99))

    print("Loading PaddleOCR (first time may download models)...")
    t_load = time.perf_counter()
    ocr = PaddleOCR(lang=lang, use_angle_cls=use_angle_cls)
    print(f"Model loaded in {time.perf_counter() - t_load:.1f}s\n")

    doc = fitz.open(path)
    limit = min(max_pages, doc.page_count)
    merged: list[str] = []

    def run_ocr_on_image(image):
        arr = np.array(image.convert("RGB"))
        results = ocr.ocr(arr, cls=use_angle_cls) or []
        lines = []
        for item in results:
            if not item or len(item) < 2:
                continue
            rec = item[1]
            if not rec or len(rec) < 2:
                continue
            text = (rec[0] or "").strip()
            if text:
                lines.append(text)
        return "\n".join(lines).strip()

    print(f"OCR {limit} pages (DPI={dpi})...")
    t0 = time.perf_counter()
    for idx in range(limit):
        page = doc.load_page(idx)
        scale = max(72, dpi) / 72.0
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        text = run_ocr_on_image(image)
        if text:
            merged.append(text)
        print(f"  Page {idx + 1}/{limit} done")
    doc.close()
    elapsed = time.perf_counter() - t0

    full_text = "\n\n".join(merged).strip()
    print(f"\n--- เวลา OCR ---")
    print(f"ใช้เวลา: {elapsed:.2f} วินาที ({elapsed / max(1, limit):.2f} s/หน้า)")
    print(f"ความยาวข้อความ: {len(full_text)} ตัวอักษร\n")
    print("--- ข้อความจาก PaddleOCR (ส่วนต้น 2500 ตัวอักษร) ---")
    print(full_text[:2500] + ("\n\n... (ตัดแสดง)" if len(full_text) > 2500 else ""))
    print()

if __name__ == "__main__":
    main()
