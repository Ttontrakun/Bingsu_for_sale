import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")
load_dotenv()

# OCR Configuration
OCR_LANG = os.getenv("OCR_LANG", "th")
OCR_MAX_PAGES = int(os.getenv("OCR_MAX_PAGES", "30"))
OCR_DPI = int(os.getenv("OCR_DPI", "150"))
OCR_USE_ANGLE_CLS = os.getenv("OCR_USE_ANGLE_CLS", "true").lower() == "true"
OCR_PROVIDER = (os.getenv("OCR_PROVIDER", "paddle") or "paddle").strip().lower()
# Maximum file size limit (MB) - files larger than this will be rejected
MAX_FILE_SIZE_MB = float(os.getenv("MAX_FILE_SIZE_MB", "5.0"))
# Sync endpoint file size limit (MB) - files larger than this will auto-reduce DPI or split PDF
# Note: Sync endpoint seems to have a limit around 2.5-3 MB, so we reduce DPI earlier
TYPHOON_SYNC_SIZE_LIMIT_MB = float(os.getenv("TYPHOON_SYNC_SIZE_LIMIT_MB", "2.5"))
# If PDF has more than this many pages, split into pages and process separately
# Sync endpoint is optimized for 1-3 pages, so we split if more than 3 pages
TYPHOON_SPLIT_PDF_PAGE_THRESHOLD = int(os.getenv("TYPHOON_SPLIT_PDF_PAGE_THRESHOLD", "3"))
TYPHOON_OCR_API_KEY = (os.getenv("TYPHOON_OCR_API_KEY", "") or "").strip()
# Typhoon OCR API endpoint (NICT Solution)
TYPHOON_OCR_API_URL = os.getenv("TYPHOON_OCR_API_URL", "https://matcha-api.ntictsolution.com/api/v1/ocr").rstrip("/")