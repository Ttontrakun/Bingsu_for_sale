from __future__ import annotations

import os

# ปิด OneDNN/PIR ก่อนโหลด Paddle เพื่อหลีกเลี่ยง 500 ConvertPirAttribute2RuntimeAttribute (Paddle 3.3.0)
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ.setdefault("FLAGS_use_pir_in_executor", "0")

import io
from typing import Any

from dotenv import load_dotenv
import httpx
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

load_dotenv(".env.local")
load_dotenv()

app = FastAPI(
    title="ask_AA API (Enterprise AI Chatbot Plus)",
    version="0.1.0",
    description="API: ระบบ, OCR, ล็อกอิน/สมาชิก, บอท, Knowledge (เอกสาร), แชท, อัปโหลด, โควต้า, สถิติ, Integrations (Admin/Support ยังเรียกได้ที่ /api/admin/*, /api/support/* แต่ไม่แสดงใน docs)",
    openapi_tags=[
        {"name": "ระบบ", "description": "ตรวจสอบสถานะ backend"},
        {"name": "OCR", "description": "ดึงข้อความจากไฟล์ PDF หรือรูปภาพ"},
        {"name": "Auth", "description": "ล็อกอิน สมัครสมาชิก ตรวจสอบอีเมล เปลี่ยนรหัส"},
        {"name": "Bots", "description": "สร้าง/แก้ไข/ลบบอท"},
        {"name": "Knowledge", "description": "ชุดความรู้ (เอกสาร) สร้าง/แก้ไข/ลบ/แชร์"},
        {"name": "แชท", "description": "บทสนทนา ส่งข้อความ แชทกับบอท"},
        {"name": "อัปโหลด", "description": "อัปโหลดไฟล์แบบแบ่งส่วน (batch)"},
        {"name": "Subscription", "description": "โควต้าและการใช้งานรายวัน"},
        {"name": "Stats", "description": "สถิติการใช้งาน"},
        {"name": "Integrations", "description": "ตั้งค่า LINE / API integration"},
    ],
)

cors_origins_env = os.getenv("CORS_ORIGINS", "")
cors_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]
# Dev (port 3000) and prod (port 80 / nginx); add LAN IP in .env if needed (e.g. http://192.168.1.8)
dev_defaults = [
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost", "http://127.0.0.1",
]
origins = list(dict.fromkeys([*cors_origins, *dev_defaults]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["ระบบ"], summary="ตรวจสอบสถานะ", description="ใช้ตรวจว่า Backend ยังรันอยู่ ตอบ `{\"ok\": true}`")
def health() -> dict:
    return {"ok": True}


LEGACY_API_URL = os.getenv("LEGACY_API_URL", "http://legacy:5050").rstrip("/")
DEFAULT_OCR_LANG = os.getenv("OCR_LANG", "th")
DEFAULT_OCR_MAX_PAGES = int(os.getenv("OCR_MAX_PAGES", "30"))
DEFAULT_OCR_DPI = int(os.getenv("OCR_DPI", "200"))
DEFAULT_OCR_USE_ANGLE_CLS = os.getenv("OCR_USE_ANGLE_CLS", "true").lower() == "true"
OCR_PROVIDER = (os.getenv("OCR_PROVIDER", "paddle") or "paddle").strip().lower()
TYPHOON_OCR_API_KEY = (os.getenv("TYPHOON_OCR_API_KEY", "") or "").strip()

_ocr_instance: Any | None = None
_ocr_lang: str | None = None


def _require_paddle_deps() -> tuple[Any, Any]:
    try:
        from paddleocr import PaddleOCR  # type: ignore
        import numpy as np  # type: ignore
    except Exception as e:
        raise RuntimeError(
            "PaddleOCR dependencies are not installed. "
            "Run: pip install -r backend/requirements.txt"
        ) from e
    return PaddleOCR, np


def _require_pdf_image_deps() -> tuple[Any, Any]:
    try:
        import fitz  # PyMuPDF  # type: ignore
        from PIL import Image  # type: ignore
    except Exception as e:
        raise RuntimeError(
            "PDF/Image dependencies are not installed. "
            "Run: pip install -r backend/requirements.txt"
        ) from e
    return fitz, Image


def get_ocr(lang: str) -> Any:
    global _ocr_instance, _ocr_lang
    normalized = (lang or DEFAULT_OCR_LANG or "th").strip() or "th"
    if _ocr_instance is None or _ocr_lang != normalized:
        # PaddleOCR will download models on first use (cached afterward).
        PaddleOCR, _np = _require_paddle_deps()
        _ocr_instance = PaddleOCR(
            lang=normalized,
            use_angle_cls=DEFAULT_OCR_USE_ANGLE_CLS,
            enable_mkldnn=False,  # ป้องกัน 500 จาก OneDNN/PIR ใน PaddlePaddle 3.3.0
        )
        _ocr_lang = normalized
    return _ocr_instance


def _filter_outgoing_headers(headers: dict[str, str]) -> dict[str, str]:
    # Avoid hop-by-hop headers; let client/server manage those.
    hop_by_hop = {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
        "host",
        "content-length",
    }
    return {k: v for k, v in headers.items() if k.lower() not in hop_by_hop}


def _is_pdf(upload: UploadFile) -> bool:
    ct = (upload.content_type or "").lower()
    name = (upload.filename or "").lower()
    return ct == "application/pdf" or name.endswith(".pdf")


def _extract_pdf_text_only(data: bytes, max_pages: int) -> tuple[list[dict], str]:
    """ดึงข้อความจาก PDF ด้วย pdfplumber เท่านั้น — อ่านเฉพาะ text layer"""
    import pdfplumber  # type: ignore
    pages_out: list[dict] = []
    merged_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        limit = max(1, min(int(max_pages), len(pdf.pages)))
        for idx in range(limit):
            page = pdf.pages[idx]
            text = (page.extract_text() or "").strip()
            pages_out.append({"page": idx + 1, "text": text})
            if text:
                merged_parts.append(text)
    merged_text = "\n\n".join(merged_parts).strip()
    return pages_out, merged_text


def _pil_from_pdf_page(page: Any, dpi: int) -> Any:
    fitz, Image = _require_pdf_image_deps()
    scale = max(72, dpi) / 72.0
    mat = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)


def _run_ocr_on_image(ocr: Any, image: Any, use_angle_cls: bool) -> tuple[str, float | None, int]:
    _PaddleOCR, np = _require_paddle_deps()
    arr = np.array(image.convert("RGB"))
    # PaddleOCR 3.x บางเวอร์ชันไม่รับ cls ใน ocr(); ใช้ use_angle_cls ตอนสร้าง instance แทน
    try:
        results = ocr.ocr(arr, cls=use_angle_cls) or []
    except TypeError:
        results = ocr.ocr(arr) or []
    lines: list[str] = []
    confidences: list[float] = []
    for item in results:
        if not item or len(item) < 2:
            continue
        rec = item[1]
        if not rec or len(rec) < 2:
            continue
        text = (rec[0] or "").strip()
        conf = rec[1]
        if text:
            lines.append(text)
            try:
                confidences.append(float(conf))
            except Exception:
                pass
    avg_conf = (sum(confidences) / len(confidences)) if confidences else None
    return "\n".join(lines).strip(), avg_conf, len(lines)

# OpenTyphoon OCR API (เรียกโดยตรง ไม่ผ่าน package)
TYPHOON_OCR_API_URL = (os.getenv("TYPHOON_OCR_API_URL", "https://api.opentyphoon.ai/v1/ocr") or "https://api.opentyphoon.ai/v1/ocr").rstrip("/")
TYPHOON_OCR_MODEL = (os.getenv("TYPHOON_OCR_MODEL", "typhoon-ocr") or "typhoon-ocr").strip()


def _run_typhoon_ocr_via_api(image_path: str, api_key: str) -> str:
    """เรียก OpenTyphoon OCR API โดยตรง (POST /v1/ocr) — ใช้เมื่อต้องการควบคุม model/params เอง"""
    with open(image_path, "rb") as f:
        files = {"file": (os.path.basename(image_path), f, "image/png")}
        data = {
            "model": TYPHOON_OCR_MODEL,
            "task_type": os.getenv("TYPHOON_OCR_TASK_TYPE", "default").strip() or "default",
        }
        headers = {"Authorization": f"Bearer {api_key}"}
        resp = httpx.post(
            TYPHOON_OCR_API_URL,
            files=files,
            data=data,
            headers=headers,
            timeout=120.0,
        )
    resp.raise_for_status()
    out = resp.json()
    if isinstance(out, dict):
        text = out.get("text") or out.get("content") or out.get("result")
        if not text and "choices" in out and out["choices"]:
            msg = out["choices"][0].get("message") or out["choices"][0]
            text = msg.get("content") or msg.get("text")
        return (text or "").strip()
    if isinstance(out, str):
        return out.strip()
    return ""


def _run_typhoon_ocr_on_image(image: Any) -> str:
    # ใช้ OpenTyphoon API โดยตรงถ้ามี TYPHOON_OCR_API_KEY; ไม่ก็ใช้ package typhoon-ocr
    if TYPHOON_OCR_API_KEY:
        if "ocr" in TYPHOON_OCR_API_URL:
            try:
                from tempfile import NamedTemporaryFile
                with NamedTemporaryFile(suffix=".png", delete=True) as tmp:
                    image.convert("RGB").save(tmp.name, format="PNG")
                    return _run_typhoon_ocr_via_api(tmp.name, TYPHOON_OCR_API_KEY)
            except Exception as e:
                raise RuntimeError(f"OpenTyphoon OCR API error: {e}") from e
        os.environ["TYPHOON_OCR_API_KEY"] = TYPHOON_OCR_API_KEY
    try:
        from tempfile import NamedTemporaryFile
        from typhoon_ocr import ocr_document
    except Exception as e:
        raise RuntimeError("typhoon-ocr is not installed. Run: pip install -r backend/requirements.txt") from e

    with NamedTemporaryFile(suffix=".png", delete=True) as tmp:
        image.convert("RGB").save(tmp.name, format="PNG")
        text = ocr_document(tmp.name)
        return (text or "").strip()


@app.post(
    "/api/ocr/extract",
    tags=["OCR"],
    summary="ดึงข้อความจาก PDF/รูป",
    description="อัปโหลดไฟล์ PDF หรือรูปภาพ แล้วได้ข้อความ (provider: text=ดึงแค่ text จาก PDF ไม่ใช้ Paddle, paddle=PaddleOCR, typhoon=Typhoon)",
)
async def ocr_extract(
    file: UploadFile = File(...),
    lang: str = DEFAULT_OCR_LANG,
    max_pages: int = DEFAULT_OCR_MAX_PAGES,
    dpi: int = DEFAULT_OCR_DPI,
    use_angle_cls: bool = DEFAULT_OCR_USE_ANGLE_CLS,
    provider: str | None = Form(None),
) -> dict:
    try:
        data = await file.read()
        if not data:
            return {"ok": False, "error": "empty file"}

        use_provider = (provider or "").strip().lower() or OCR_PROVIDER
        if use_provider not in ("paddle", "typhoon", "text"):
            use_provider = "paddle"
        ocr = get_ocr(lang) if use_provider == "paddle" else None

        pages_out: list[dict] = []
        merged_parts: list[str] = []
        merged_text: str

        if _is_pdf(file):
            if use_provider == "text":
                # ดึงข้อความจาก PDF ด้วย pdfplumber เท่านั้น
                pages_out, merged_text = _extract_pdf_text_only(data, max_pages)
            else:
                fitz, _Image = _require_pdf_image_deps()
                doc = fitz.open(stream=data, filetype="pdf")
                limit = max(1, min(int(max_pages), doc.page_count))
                for idx in range(limit):
                    page = doc.load_page(idx)
                    image = _pil_from_pdf_page(page, dpi=dpi)
                    if use_provider == "typhoon":
                        text = _run_typhoon_ocr_on_image(image)
                        pages_out.append({"page": idx + 1, "text": text})
                    else:
                        text, avg_conf, line_count = _run_ocr_on_image(ocr, image, use_angle_cls=use_angle_cls)
                        pages_out.append(
                            {
                                "page": idx + 1,
                                "text": text,
                                "lines": line_count,
                                "avgConfidence": avg_conf,
                            }
                        )
                    if text:
                        merged_parts.append(text)
                doc.close()
                merged_text = "\n\n".join(merged_parts).strip()
        else:
            # รูปภาพ: provider "text" ไม่รองรับ — ต้องใช้ paddle หรือ typhoon
            if use_provider == "text":
                return {
                    "ok": False,
                    "error": "provider=text รองรับเฉพาะ PDF (ดึงข้อความโดยตรง). สำหรับรูปภาพให้ใช้ provider=paddle หรือ typhoon",
                }
            _fitz, Image = _require_pdf_image_deps()
            image = Image.open(io.BytesIO(data))
            if use_provider == "typhoon":
                text = _run_typhoon_ocr_on_image(image)
                pages_out.append({"page": 1, "text": text})
            else:
                text, avg_conf, line_count = _run_ocr_on_image(ocr, image, use_angle_cls=use_angle_cls)
                pages_out.append({"page": 1, "text": text, "lines": line_count, "avgConfidence": avg_conf})
            if text:
                merged_parts.append(text)
            merged_text = "\n\n".join(merged_parts).strip()
        return {
            "ok": True,
            "lang": (lang or DEFAULT_OCR_LANG or "th").strip() or "th",
            "pages": pages_out,
            "text": merged_text,
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


async def _proxy_forward(request: Request) -> Response:
    """ส่งต่อ request ไปยัง Legacy (Node) — path มาจาก request.url.path"""
    path = request.url.path.removeprefix("/api").lstrip("/")
    upstream_url = f"{LEGACY_API_URL}/api/{path}" if path else f"{LEGACY_API_URL}/api"
    if request.url.query:
        upstream_url = f"{upstream_url}?{request.url.query}"

    body = await request.body()
    headers = _filter_outgoing_headers(dict(request.headers))
    headers["Host"] = (LEGACY_API_URL or "").replace("https://", "").replace("http://", "").split("/")[0] or "legacy"
    if body:
        headers["Content-Length"] = str(len(body))

    # preview-structure / OCR / บันทึก+แปลง vector ใช้เวลานาน — 20 นาที ให้สอดคล้องกับ nginx
    timeout = httpx.Timeout(1200.0, connect=60.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            upstream = await client.request(
                request.method,
                upstream_url,
                content=body if body else None,
                headers=headers,
            )
    except (httpx.ConnectError, httpx.ConnectTimeout):
        return Response(
            content='{"error":"เชื่อมต่อ backend ไม่ได้ — ตรวจสอบว่า container legacy และ api รันอยู่ (docker compose ps)"}'.encode("utf-8"),
            status_code=503,
            media_type="application/json",
        )
    except httpx.ReadTimeout:
        return Response(
            content='{"error":"ประมวลผลเกินเวลา — ลองลดขนาดไฟล์หรือลองใหม่"}'.encode("utf-8"),
            status_code=504,
            media_type="application/json",
        )

    response_headers = _filter_outgoing_headers(dict(upstream.headers))
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=response_headers,
        media_type=upstream.headers.get("content-type"),
    )


# รายการ Legacy API ทั้งหมด — แสดงใน Swagger และส่งต่อไปที่ Node
_LEGACY_ROUTES = [
    # Auth
    ("POST", "auth/signup", "สมัครสมาชิก", "Auth"),
    ("POST", "auth/login", "ล็อกอิน", "Auth"),
    ("POST", "auth/verify-email", "ยืนยันอีเมล", "Auth"),
    ("POST", "auth/resend-verification", "ส่งอีเมลยืนยันอีกครั้ง", "Auth"),
    ("POST", "auth/request-password-reset", "ขอรีเซ็ตรหัสผ่าน", "Auth"),
    ("POST", "auth/reset-password", "รีเซ็ตรหัสผ่าน", "Auth"),
    ("POST", "auth/change-password", "เปลี่ยนรหัสผ่าน", "Auth"),
    ("GET", "auth/me", "ดูข้อมูลผู้ใช้ปัจจุบัน", "Auth"),
    ("PATCH", "auth/me", "อัปเดตโปรไฟล์", "Auth"),
    ("POST", "auth/logout", "ล็อกเอาท์", "Auth"),
    # Bots
    ("GET", "bots/help-config", "config บอทช่วยสอน (ไม่ต้องล็อกอิน)", "Bots"),
    ("GET", "bots", "รายการบอท", "Bots"),
    ("POST", "bots", "สร้างบอท", "Bots"),
    ("PATCH", "bots/{id}", "แก้ไขบอท", "Bots"),
    ("DELETE", "bots/{id}", "ลบบอท", "Bots"),
    # Documents (Knowledge)
    ("GET", "documents", "รายการชุดความรู้", "Knowledge"),
    ("POST", "documents", "สร้างชุดความรู้", "Knowledge"),
    ("GET", "documents/{id}", "ดูรายละเอียดชุดความรู้", "Knowledge"),
    ("PATCH", "documents/{id}", "แก้ไขชุดความรู้", "Knowledge"),
    ("DELETE", "documents/{id}", "ลบชุดความรู้", "Knowledge"),
    ("GET", "documents/{id}/shares", "รายการแชร์", "Knowledge"),
    ("POST", "documents/{id}/shares", "แชร์ชุดความรู้", "Knowledge"),
    ("DELETE", "documents/{id}/shares", "ยกเลิกแชร์", "Knowledge"),
    ("GET", "documents/{id}/files/{index}/download", "ดาวน์โหลดไฟล์ต้นฉบับ", "Knowledge"),
    # Conversations & Chat
    ("POST", "conversations", "สร้างบทสนทนาใหม่", "แชท"),
    ("GET", "conversations", "รายการบทสนทนา", "แชท"),
    ("DELETE", "conversations", "ลบหลายบทสนทนา", "แชท"),
    ("DELETE", "conversations/{id}", "ลบบทสนทนา", "แชท"),
    ("GET", "conversations/{id}/messages", "ข้อความในบทสนทนา", "แชท"),
    ("POST", "messages", "ส่งข้อความ (แชท)", "แชท"),
    ("POST", "messages/{id}/feedback", "ส่ง feedback ข้อความ", "แชท"),
    ("POST", "chat", "แชทกับบอท (ส่งคำถามได้คำตอบ)", "แชท"),
    # Uploads
    ("POST", "upload-batches", "สร้าง batch อัปโหลด", "อัปโหลด"),
    ("GET", "upload-batches/{id}", "สถานะ batch", "อัปโหลด"),
    ("POST", "upload-batches/{id}/files", "เพิ่มไฟล์ใน batch", "อัปโหลด"),
    ("PUT", "uploads/{id}/parts/{partNumber}", "อัปโหลดส่วนของไฟล์", "อัปโหลด"),
    ("POST", "uploads/{id}/complete", "ยืนยันอัปโหลดไฟล์เสร็จ", "อัปโหลด"),
    ("POST", "upload-batches/{id}/complete", "ยืนยัน batch เสร็จ", "อัปโหลด"),
    # Subscription & Stats
    ("GET", "subscription/subscription", "โควต้าและการใช้งาน", "Subscription"),
    ("GET", "stats/stats", "สถิติการใช้งาน", "Stats"),
    # Integrations
    ("GET", "integrations/integrations", "รายการ integration", "Integrations"),
    ("PATCH", "integrations/integrations/{provider}", "ตั้งค่า integration (LINE ฯลฯ)", "Integrations"),
    # Admin, Support — ไม่ใส่ใน Swagger ตอนนี้ (เรียก /api/admin/*, /api/support/* ได้ตามปกติ แค่ไม่โชว์ใน docs)
    # Misc
    ("GET", "ping", "ping (Legacy)", "ระบบ"),
    ("GET", "avatars/{filename}", "รูปโปรไฟล์", "Auth"),
]

def _add_legacy_route(method: str, path_suffix: str, summary: str, tag: str) -> None:
    path = f"/api/{path_suffix}" if path_suffix else "/api"
    app.add_api_route(
        path,
        _proxy_forward,
        methods=[method],
        summary=summary,
        tags=[tag],
        include_in_schema=True,
    )

for _method, _path, _summary, _tag in _LEGACY_ROUTES:
    _add_legacy_route(_method, _path, _summary, _tag)


@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    include_in_schema=False,
)
async def proxy_to_legacy(path: str, request: Request) -> Response:
    """ส่งต่อ path อื่นที่ไม่ได้ลงทะเบียนไว้ด้านบน"""
    return await _proxy_forward(request)

