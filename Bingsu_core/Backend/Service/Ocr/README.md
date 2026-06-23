# Enterprise AI Chatbot OCR Service

OCR (Optical Character Recognition) service สำหรับดึงข้อความจากไฟล์ PDF และรูปภาพ

## Features

- ✅ รองรับ PDF และรูปภาพ (PNG, JPG, etc.)
- ✅ รองรับ 2 providers: PaddleOCR และ Typhoon OCR
- ✅ Multi-page PDF processing
- ✅ Configurable DPI, language, max pages
- ✅ Confidence scores (PaddleOCR only)

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

**Note**: PaddleOCR จะดาวน์โหลดโมเดลครั้งแรกที่ใช้งาน (อาจใช้เวลาสักครู่)

### 2. Configure Environment Variables

Create a `.env` file in parent directory:

```env
# OCR Configuration
OCR_LANG="th"                    # Language code (th, en, etc.)
OCR_MAX_PAGES="30"               # Maximum pages to process
OCR_DPI="200"                    # DPI for PDF rendering
OCR_USE_ANGLE_CLS="true"         # Use angle classification
OCR_PROVIDER="paddle"            # "paddle" or "typhoon"

# For Typhoon OCR (if using)
TYPHOON_OCR_API_KEY="your-api-key"
```

### 3. Run OCR Service

```bash
# Development (รันจาก Backend/Service/Ocr directory)
cd Backend/Service/Ocr
python ocr.py

# Or with uvicorn
uvicorn ocr:app --host 0.0.0.0 --port 8001 --reload
```

## API Endpoints

### Health Check

```bash
GET /health
```

Response:
```json
{"ok": true}
```

### Extract Text

```bash
POST /api/ocr/extract
```

**Form Data:**
- `file` (required): PDF or image file
- `lang` (optional): Language code (default: "th")
- `max_pages` (optional): Maximum pages (default: 30)
- `dpi` (optional): DPI for PDF (default: 200)
- `use_angle_cls` (optional): Use angle classification (default: true)

**Response:**
```json
{
  "ok": true,
  "lang": "th",
  "pages": [
    {
      "page": 1,
      "text": "Extracted text...",
      "lines": 10,
      "avgConfidence": 0.95
    }
  ],
  "text": "Merged text from all pages..."
}
```

## Usage Example

### Python

```python
import requests

url = "http://localhost:8001/api/ocr/extract"
files = {"file": open("document.pdf", "rb")}
data = {
    "lang": "th",
    "max_pages": 10,
    "dpi": 200
}
response = requests.post(url, files=files, data=data)
result = response.json()
print(result["text"])
```

### JavaScript/Node.js

```javascript
import FormData from "form-data";
import fs from "fs";
import fetch from "node-fetch";

const form = new FormData();
form.append("file", fs.createReadStream("document.pdf"));
form.append("lang", "th");
form.append("max_pages", "10");

const response = await fetch("http://localhost:8001/api/ocr/extract", {
  method: "POST",
  body: form,
});

const result = await response.json();
console.log(result.text);
```

### cURL

```bash
curl -X POST "http://localhost:8001/api/ocr/extract" \
  -F "file=@document.pdf" \
  -F "lang=th" \
  -F "max_pages=10"
```

## OCR Providers

### PaddleOCR (Default)

- ✅ Free and open-source
- ✅ Works offline
- ✅ Supports multiple languages
- ✅ Provides confidence scores
- ⚠️ First-time model download is large (~500MB)
- ⚠️ Requires more memory

### Typhoon OCR

- ✅ Cloud-based API
- ✅ Fast processing
- ✅ No local model storage
- ⚠️ Requires API key
- ⚠️ Requires internet connection

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OCR_LANG` | `"th"` | Language code for OCR |
| `OCR_MAX_PAGES` | `30` | Maximum pages to process |
| `OCR_DPI` | `200` | DPI for PDF rendering |
| `OCR_USE_ANGLE_CLS` | `"true"` | Use angle classification |
| `OCR_PROVIDER` | `"paddle"` | OCR provider: "paddle" or "typhoon" |
| `TYPHOON_OCR_API_KEY` | `""` | API key for Typhoon OCR |

## Troubleshooting

### PaddleOCR model download fails

- Check internet connection
- Ensure sufficient disk space (~500MB)
- Models are cached after first download

### Memory issues

- Reduce `OCR_MAX_PAGES`
- Use lower `OCR_DPI`
- Consider using Typhoon OCR for cloud processing

### Typhoon OCR errors

- Verify `TYPHOON_OCR_API_KEY` is set
- Check API key validity
- Ensure internet connection

## Dependencies

- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `paddleocr` - PaddleOCR library
- `PyMuPDF` - PDF processing
- `Pillow` - Image processing
- `typhoon-ocr` - Typhoon OCR library (optional)
