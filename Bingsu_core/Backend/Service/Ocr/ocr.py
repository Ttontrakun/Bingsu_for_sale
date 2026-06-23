"""
OCR Service - Extract text from PDF and images
Supports PaddleOCR and Typhoon OCR providers
"""
import io
import os
from typing import Any
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from config import (
    OCR_LANG,
    OCR_MAX_PAGES,
    OCR_DPI,
    OCR_USE_ANGLE_CLS,
    OCR_PROVIDER,
    TYPHOON_OCR_API_KEY,
    TYPHOON_OCR_API_URL,
    TYPHOON_SYNC_SIZE_LIMIT_MB,
    TYPHOON_SPLIT_PDF_PAGE_THRESHOLD,
    MAX_FILE_SIZE_MB,
)

app = FastAPI(title="Enterprise AI Chatbot OCR Service", version="1.0.0")

# Global OCR instance
_ocr_instance: Any | None = None
_ocr_lang: str | None = None

DEFAULT_OCR_LANG = OCR_LANG
DEFAULT_OCR_MAX_PAGES = OCR_MAX_PAGES
DEFAULT_OCR_DPI = OCR_DPI
DEFAULT_OCR_USE_ANGLE_CLS = OCR_USE_ANGLE_CLS


def _require_paddle_deps() -> tuple[Any, Any]:
    """Require PaddleOCR dependencies"""
    try:
        from paddleocr import PaddleOCR  # type: ignore
        import numpy as np  # type: ignore
    except Exception as e:
        raise RuntimeError(
            "PaddleOCR dependencies are not installed. "
            "Run: pip install -r requirements.txt"
        ) from e
    return PaddleOCR, np


def _require_pdf_image_deps() -> tuple[Any, Any]:
    """Require PDF/Image dependencies"""
    try:
        import fitz  # PyMuPDF  # type: ignore
        from PIL import Image  # type: ignore
    except Exception as e:
        raise RuntimeError(
            "PDF/Image dependencies are not installed. "
            "Run: pip install -r requirements.txt"
        ) from e
    return fitz, Image


def get_ocr(lang: str) -> Any:
    """Get or create OCR instance"""
    global _ocr_instance, _ocr_lang
    normalized = (lang or DEFAULT_OCR_LANG or "th").strip() or "th"
    if _ocr_instance is None or _ocr_lang != normalized:
        # PaddleOCR will download models on first use (cached afterward).
        PaddleOCR, _np = _require_paddle_deps()
        _ocr_instance = PaddleOCR(lang=normalized, use_angle_cls=DEFAULT_OCR_USE_ANGLE_CLS)
        _ocr_lang = normalized
    return _ocr_instance


def _is_pdf(upload: UploadFile) -> bool:
    """Check if file is PDF"""
    ct = (upload.content_type or "").lower()
    name = (upload.filename or "").lower()
    return ct == "application/pdf" or name.endswith(".pdf")


def _pil_from_pdf_page(page: Any, dpi: int) -> Any:
    """Convert PDF page to PIL Image"""
    fitz, Image = _require_pdf_image_deps()
    scale = max(72, dpi) / 72.0
    mat = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)


def _run_ocr_on_image(ocr: Any, image: Any, use_angle_cls: bool) -> tuple[str, float | None, int]:
    """Run OCR on image using PaddleOCR"""
    _PaddleOCR, np = _require_paddle_deps()
    arr = np.array(image.convert("RGB"))
    
    # PaddleOCR 3.4.0+ doesn't support cls parameter in ocr() method
    # The use_angle_cls is set during initialization, not in ocr() call
    # Always call ocr.ocr() without cls parameter for PaddleOCR 3.4.0+
    try:
        results = ocr.ocr(arr) or []
    except Exception as e:
        error_msg = str(e)
        # If error mentions cls parameter, it's likely an API mismatch
        if "cls" in error_msg.lower() or "unexpected keyword" in error_msg.lower():
            # Try without any optional parameters
            try:
                results = ocr.ocr(arr) or []
            except Exception as e2:
                raise RuntimeError(f"Failed to run OCR (API mismatch): {str(e2)}") from e2
        else:
            raise RuntimeError(f"Failed to run OCR: {error_msg}") from e
    
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


async def _run_typhoon_ocr_api(file_data: bytes, filename: str, dpi: int = 150) -> str:
    """Run OCR using Typhoon OCR API (NICT Solution)"""
    import time
    start_time = time.time()
    
    if not TYPHOON_OCR_API_KEY:
        raise RuntimeError("TYPHOON_OCR_API_KEY is not set. Please configure it in .env.local")
    
    try:
        import httpx
    except ImportError:
        raise RuntimeError("httpx is not installed. Run: pip install httpx")
    
    # Use sync endpoint for immediate results
    url = f"{TYPHOON_OCR_API_URL}/sync"
    
    # Prepare headers
    headers = {
        "Authorization": f"Bearer {TYPHOON_OCR_API_KEY}",
    }
    
    # Prepare form data
    files = {
        "file": (filename, file_data)
    }
    data = {
        "dpi": str(dpi)
    }
    
    file_size_mb = len(file_data) / (1024 * 1024)
    
    # Auto-adjust DPI for large files to avoid 413 error
    # Sync endpoint seems to have a limit around 2.5-3 MB
    # Larger files need lower DPI to stay within sync endpoint limits
    original_dpi = dpi
    if file_size_mb > TYPHOON_SYNC_SIZE_LIMIT_MB:
        # Reduce DPI for large files: 300 -> 200, 200 -> 150
        if dpi >= 300:
            dpi = 200
            print(f"⚠️  File size ({file_size_mb:.2f} MB) exceeds limit ({TYPHOON_SYNC_SIZE_LIMIT_MB} MB). Reducing DPI from {original_dpi} to {dpi}")
        elif dpi >= 200:
            dpi = 150
            print(f"⚠️  File size ({file_size_mb:.2f} MB) exceeds limit ({TYPHOON_SYNC_SIZE_LIMIT_MB} MB). Reducing DPI from {original_dpi} to {dpi}")
        elif dpi == 150 and file_size_mb > 3.0:
            # For very large files (>3MB), we can't reduce DPI further
            # But we'll try anyway and handle 413 error
            print(f"⚠️  File size ({file_size_mb:.2f} MB) is large. Using DPI 150 (minimum). May still get 413 error.")
        data["dpi"] = str(dpi)
    
    print(f"🔄 Starting Typhoon OCR API call for {filename} ({file_size_mb:.2f} MB, DPI: {dpi})")
    
    try:
        # Use shorter timeout for faster failure detection
        # Connection timeout: 10s, Read timeout: 120s (2 minutes)
        timeout = httpx.Timeout(10.0, read=120.0)
        async with httpx.AsyncClient(timeout=timeout, limits=httpx.Limits(max_keepalive_connections=5)) as client:
            request_start = time.time()
            response = await client.post(url, headers=headers, files=files, data=data)
            request_time = time.time() - request_start
            print(f"⏱️  API request completed in {request_time:.2f}s (status: {response.status_code})")
            
            # Handle 413 error by retrying with lower DPI or providing better error message
            if response.status_code == 413:
                if dpi > 150:
                    # Retry with minimum DPI
                    print(f"⚠️  Received 413 error with DPI {dpi}. Retrying with DPI 150 (lowest quality)")
                    data["dpi"] = "150"
                    response = await client.post(url, headers=headers, files=files, data=data)
                    request_time = time.time() - request_start
                    print(f"⏱️  Retry request completed in {request_time:.2f}s (status: {response.status_code})")
                    
                    # If still 413 after retry, raise with helpful message
                    if response.status_code == 413:
                        raise RuntimeError(
                            f"Typhoon OCR API error (413): File size ({file_size_mb:.2f} MB) is too large for sync endpoint "
                            f"even with minimum DPI (150). Sync endpoint limit appears to be around 2.5-3 MB. "
                            f"Please use a smaller file or split the document."
                        )
                else:
                    # Already using DPI 150, can't reduce further
                    raise RuntimeError(
                        f"Typhoon OCR API error (413): File size ({file_size_mb:.2f} MB) is too large for sync endpoint "
                        f"even with minimum DPI (150). Sync endpoint limit appears to be around 2.5-3 MB. "
                        f"Please use a smaller file or split the document."
                    )
            
            response.raise_for_status()
            parse_start = time.time()
            result = response.json()
            parse_time = time.time() - parse_start
            print(f"⏱️  JSON parsing completed in {parse_time:.3f}s")
            
            if result.get("status") == "success":
                # Extract text from result
                # Response structure from NICT Solution API:
                # {
                #   "status": "success",
                #   "mode": "sync",
                #   "result": { ... OCR result data ... },
                #   "message": "OCR processing completed",
                #   "request_params": { ... }
                # }
                ocr_result = result.get("result", {})
                
                # Try to extract text from various possible structures
                if isinstance(ocr_result, dict):
                    # Try direct text field
                    text = ocr_result.get("text", "") or ocr_result.get("content", "") or ""
                    
                    # If no direct text, try pages array
                    if not text and "pages" in ocr_result:
                        pages = ocr_result.get("pages", [])
                        texts = []
                        for page in pages:
                            if isinstance(page, dict):
                                page_text = page.get("text", "") or page.get("content", "")
                                if page_text:
                                    texts.append(page_text)
                            elif isinstance(page, str):
                                texts.append(page)
                        text = "\n\n".join(texts)
                    
                    # If still no text, try markdown or raw fields
                    if not text:
                        text = ocr_result.get("markdown", "") or ocr_result.get("raw", "") or ""
                    
                    total_time = time.time() - start_time
                    print(f"✅ Typhoon OCR completed in {total_time:.2f}s, extracted {len(text)} characters")
                    return text.strip() if text else ""
                elif isinstance(ocr_result, str):
                    # Result is directly a string
                    total_time = time.time() - start_time
                    print(f"✅ Typhoon OCR completed in {total_time:.2f}s, extracted {len(ocr_result)} characters")
                    return ocr_result.strip()
                else:
                    # Fallback: convert to string
                    result_str = str(ocr_result).strip() if ocr_result else ""
                    total_time = time.time() - start_time
                    print(f"✅ Typhoon OCR completed in {total_time:.2f}s, extracted {len(result_str)} characters")
                    return result_str
            else:
                error_msg = result.get("message", "Unknown error")
                raise RuntimeError(f"Typhoon OCR API error: {error_msg}")
    except httpx.HTTPStatusError as e:
        error_detail = ""
        try:
            error_json = e.response.json()
            error_detail = error_json.get("message", str(e))
        except:
            error_detail = str(e)
        
        if e.response.status_code == 401:
            raise RuntimeError(f"Typhoon OCR API authentication failed (401). Please check your TYPHOON_OCR_API_KEY. Error: {error_detail}")
        elif e.response.status_code == 403:
            raise RuntimeError(f"Typhoon OCR API permission denied (403). Please check your API key permissions. Error: {error_detail}")
        elif e.response.status_code == 400:
            raise RuntimeError(f"Typhoon OCR API bad request (400). Error: {error_detail}")
        elif e.response.status_code == 504:
            raise RuntimeError(f"Typhoon OCR API timeout (504). The document may be too large. Consider using async mode. Error: {error_detail}")
        else:
            raise RuntimeError(f"Typhoon OCR API error ({e.response.status_code}): {error_detail}")
    except httpx.TimeoutException:
        raise RuntimeError("Typhoon OCR API request timeout. The document may be too large.")
    except Exception as e:
        raise RuntimeError(f"Failed to call Typhoon OCR API: {str(e)}")


async def _run_typhoon_ocr_api_split_pdf(pdf_data: bytes, filename: str, dpi: int = 150, max_pages: int = 30) -> tuple[list[dict], str]:
    """
    Split PDF into pages and process each page separately with Typhoon OCR API
    Returns: (pages_out, merged_text)
    """
    import time
    import io
    start_time = time.time()
    
    try:
        fitz, Image = _require_pdf_image_deps()
    except Exception as e:
        raise RuntimeError(f"Failed to load PDF dependencies: {str(e)}")
    
    # Open PDF
    doc = fitz.open(stream=pdf_data, filetype="pdf")
    total_pages = doc.page_count
    limit = min(max_pages, total_pages)
    
    print(f"📄 Splitting PDF into {limit} pages for Typhoon OCR processing...")
    
    pages_out: list[dict] = []
    merged_parts: list[str] = []
    
    try:
        for idx in range(limit):
            try:
                page = doc.load_page(idx)
                
                # Convert page to image
                scale = max(72, dpi) / 72.0
                mat = fitz.Matrix(scale, scale)
                pix = page.get_pixmap(matrix=mat, alpha=False)
                image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                
                # Convert image to bytes
                img_bytes = io.BytesIO()
                image.save(img_bytes, format="PNG")
                img_bytes.seek(0)
                page_data = img_bytes.getvalue()
                
                # Process page with Typhoon OCR
                page_filename = f"{filename}_page_{idx + 1}.png"
                print(f"🔄 Processing page {idx + 1}/{limit}...")
                page_text = await _run_typhoon_ocr_api(page_data, page_filename, dpi=dpi)
                
                pages_out.append({
                    "page": idx + 1,
                    "text": page_text
                })
                
                if page_text:
                    merged_parts.append(page_text)
                    
            except Exception as page_error:
                error_msg = f"Error processing page {idx + 1}: {str(page_error)}"
                print(f"⚠️  {error_msg}")
                # Continue with next page
                pages_out.append({
                    "page": idx + 1,
                    "text": "",
                    "error": error_msg
                })
                continue
        
        doc.close()
        
        merged_text = "\n\n".join(merged_parts).strip()
        total_time = time.time() - start_time
        print(f"✅ PDF split processing completed in {total_time:.2f}s, processed {len(pages_out)} pages, extracted {len(merged_text)} characters")
        
        return pages_out, merged_text
        
    except Exception as e:
        if doc:
            doc.close()
        raise RuntimeError(f"Failed to split and process PDF: {str(e)}")


def _run_typhoon_ocr_on_image(image: Any) -> str:
    """Run OCR on image using Typhoon OCR (legacy - uses typhoon-ocr library)"""
    # This function is kept for backward compatibility
    # New implementation uses _run_typhoon_ocr_api directly
    if TYPHOON_OCR_API_KEY:
        os.environ["TYPHOON_OCR_API_KEY"] = TYPHOON_OCR_API_KEY
    try:
        from tempfile import NamedTemporaryFile
        from typhoon_ocr import ocr_document
    except Exception as e:
        raise RuntimeError("typhoon-ocr is not installed. Run: pip install -r requirements.txt") from e

    with NamedTemporaryFile(suffix=".png", delete=True) as tmp:
        image.convert("RGB").save(tmp.name, format="PNG")
        text = ocr_document(tmp.name)
        return (text or "").strip()


@app.get("/health")
def health() -> dict:
    """Health check endpoint"""
    return {"ok": True}


@app.post("/api/ocr/extract")
async def ocr_extract(
    file: UploadFile = File(...),
    lang: str = None,
    max_pages: int = None,
    dpi: int = None,
    use_angle_cls: bool = None,
) -> dict:
    """
    Extract text from PDF or image file
    
    - **file**: PDF or image file to process
    - **lang**: Language code (default: from config)
    - **max_pages**: Maximum pages to process (default: from config)
    - **dpi**: DPI for PDF rendering (default: from config)
    - **use_angle_cls**: Use angle classification (default: from config)
    """
    import traceback
    try:
        # Use defaults from config if not provided
        lang = lang or DEFAULT_OCR_LANG or "th"
        max_pages = max_pages if max_pages is not None else DEFAULT_OCR_MAX_PAGES
        dpi = dpi if dpi is not None else DEFAULT_OCR_DPI
        use_angle_cls = use_angle_cls if use_angle_cls is not None else DEFAULT_OCR_USE_ANGLE_CLS
        
        # Convert string parameters to proper types if needed
        if isinstance(lang, str):
            lang = lang.strip() or "th"
        if isinstance(max_pages, str):
            try:
                max_pages = int(max_pages)
            except ValueError:
                max_pages = DEFAULT_OCR_MAX_PAGES
        if isinstance(dpi, str):
            try:
                dpi = int(dpi)
            except ValueError:
                dpi = DEFAULT_OCR_DPI
        if isinstance(use_angle_cls, str):
            use_angle_cls = use_angle_cls.lower() in ("true", "1", "yes")
        
        data = await file.read()
        if not data:
            return JSONResponse(
                status_code=400,
                content={"ok": False, "error": "empty file"}
            )
        
        # Check file size limit (5MB)
        file_size_mb = len(data) / (1024 * 1024)
        if file_size_mb > MAX_FILE_SIZE_MB:
            return JSONResponse(
                status_code=400,
                content={
                    "ok": False,
                    "error": f"File size ({file_size_mb:.2f} MB) exceeds maximum limit ({MAX_FILE_SIZE_MB} MB). Maximum file size is {MAX_FILE_SIZE_MB} MB."
                }
            )

        provider = OCR_PROVIDER
        if provider not in ("paddle", "typhoon"):
            provider = "paddle"
        
        ocr = None
        if provider == "paddle":
            try:
                ocr = get_ocr(lang)
            except Exception as e:
                error_msg = f"Failed to initialize PaddleOCR: {str(e)}"
                print(f"❌ {error_msg}")
                import traceback
                traceback.print_exc()
                return JSONResponse(
                    status_code=500,
                    content={"ok": False, "error": error_msg}
                )

        pages_out: list[dict] = []
        merged_parts: list[str] = []

        # For Typhoon OCR, check if we need to split PDF based on page count
        # Sync endpoint is optimized for 1-3 pages, so we split if more than 3 pages
        if provider == "typhoon":
            try:
                filename = file.filename or "document.pdf" if _is_pdf(file) else "image.png"
                file_size_mb = len(data) / (1024 * 1024)
                is_pdf = _is_pdf(file)
                
                # Check page count for PDFs
                should_split = False
                if is_pdf:
                    try:
                        fitz, _Image = _require_pdf_image_deps()
                        doc = fitz.open(stream=data, filetype="pdf")
                        page_count = doc.page_count
                        doc.close()
                        
                        # Split if more than threshold pages (default: 3)
                        if page_count > TYPHOON_SPLIT_PDF_PAGE_THRESHOLD:
                            should_split = True
                            print(f"📄 PDF has {page_count} pages (exceeds {TYPHOON_SPLIT_PDF_PAGE_THRESHOLD} page threshold). Splitting into pages for processing...")
                        else:
                            print(f"📄 PDF has {page_count} pages (≤ {TYPHOON_SPLIT_PDF_PAGE_THRESHOLD} pages). Sending entire file to API...")
                    except Exception as pdf_check_error:
                        # If we can't check pages, fall back to file size check
                        print(f"⚠️  Could not check PDF page count: {str(pdf_check_error)}. Using file size check instead.")
                        if file_size_mb > 3.0:
                            should_split = True
                            print(f"📄 PDF size ({file_size_mb:.2f} MB) exceeds 3.0 MB. Splitting into pages...")
                
                # Split PDF into pages if needed
                if should_split:
                    pages_out, merged_text = await _run_typhoon_ocr_api_split_pdf(data, filename, dpi=dpi, max_pages=max_pages)
                    merged_parts = [page.get("text", "") for page in pages_out if page.get("text")]
                else:
                    # For PDFs ≤ 3 pages or images, send directly (faster)
                    text = await _run_typhoon_ocr_api(data, filename, dpi=dpi)
                    pages_out.append({"page": 1, "text": text})
                    if text:
                        merged_parts.append(text)
            except Exception as typhoon_error:
                error_msg = f"Typhoon OCR error: {str(typhoon_error)}"
                print(f"❌ {error_msg}")
                traceback.print_exc()
                return JSONResponse(
                    status_code=500,
                    content={"ok": False, "error": error_msg}
                )
        elif _is_pdf(file):
            # PaddleOCR: Process PDF page by page
            try:
                fitz, _Image = _require_pdf_image_deps()
                doc = fitz.open(stream=data, filetype="pdf")
                limit = max(1, min(int(max_pages), doc.page_count))
                for idx in range(limit):
                    try:
                        page = doc.load_page(idx)
                        image = _pil_from_pdf_page(page, dpi=dpi)
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
                    except Exception as page_error:
                        error_msg = f"Error processing page {idx + 1}: {str(page_error)}"
                        print(f"⚠️  {error_msg}")
                        # Continue with next page
                        continue
                doc.close()
            except Exception as pdf_error:
                error_msg = f"Error processing PDF: {str(pdf_error)}"
                print(f"❌ {error_msg}")
                traceback.print_exc()
                return JSONResponse(
                    status_code=500,
                    content={"ok": False, "error": error_msg}
                )
        else:
            # PaddleOCR: Process image
            try:
                _fitz, Image = _require_pdf_image_deps()
                image = Image.open(io.BytesIO(data))
                text, avg_conf, line_count = _run_ocr_on_image(ocr, image, use_angle_cls=use_angle_cls)
                pages_out.append({"page": 1, "text": text, "lines": line_count, "avgConfidence": avg_conf})
                if text:
                    merged_parts.append(text)
            except Exception as image_error:
                error_msg = f"Error processing image: {str(image_error)}"
                print(f"❌ {error_msg}")
                traceback.print_exc()
                return JSONResponse(
                    status_code=500,
                    content={"ok": False, "error": error_msg}
                )

        merged_text = "\n\n".join(merged_parts).strip()
        return {
            "ok": True,
            "lang": lang,
            "pages": pages_out,
            "text": merged_text,
            "blocks": [{"text": merged_text, "label": "Content"}] if merged_text else [],
        }
    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        print(f"❌ {error_msg}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": error_msg}
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
