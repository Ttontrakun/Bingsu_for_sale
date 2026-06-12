/**
 * OCR Client - Node.js client for OCR service
 * Use this to call OCR API from Node.js services
 */

const OCR_API_URL = (process.env.OCR_API_URL || "http://localhost:8001").replace(/\/+$/, "");
const OCR_ENABLED = (process.env.OCR_ENABLED || "true") === "true";
const OCR_LANG = process.env.OCR_LANG || "th";
const OCR_MAX_PAGES = Number(process.env.OCR_MAX_PAGES || 30);
const OCR_DPI = Number(process.env.OCR_DPI || 200);
const OCR_USE_ANGLE_CLS = (process.env.OCR_USE_ANGLE_CLS || "true") === "true";
const OCR_MIN_TEXT_CHARS = Number(process.env.OCR_MIN_TEXT_CHARS || 200);

/**
 * Check if OCR should run for PDF
 * @param {Object} options
 * @param {string} options.text - Extracted text from PDF
 * @param {number} options.pageCount - Number of pages
 * @returns {boolean}
 */
export const shouldRunOcrForPdf = ({ text = "", pageCount = 0 } = {}) => {
  if (!OCR_ENABLED) return false;
  if (!OCR_API_URL) return false;
  if (!pageCount) return false;
  const normalized = String(text || "").replace(/\s+/g, "").trim();
  return normalized.length < OCR_MIN_TEXT_CHARS;
};

/**
 * Run OCR extraction on file
 * @param {Object} options
 * @param {Buffer} options.buffer - File buffer
 * @param {string} options.fileName - File name
 * @param {string} options.contentType - Content type
 * @returns {Promise<Object>} OCR result
 */
export const runOcrExtract = async ({ buffer, fileName, contentType }) => {
  if (!OCR_API_URL) {
    throw new Error("OCR_API_URL is not set");
  }
  const url = `${OCR_API_URL}/api/ocr/extract`;
  const form = new FormData();
  form.append(
    "file",
    new Blob([buffer], { type: contentType || "application/pdf" }),
    fileName || "document.pdf",
  );
  form.append("lang", OCR_LANG);
  form.append("max_pages", String(OCR_MAX_PAGES));
  form.append("dpi", String(OCR_DPI));
  form.append("use_angle_cls", String(OCR_USE_ANGLE_CLS));

  const response = await fetch(url, { method: "POST", body: form });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `OCR request failed: ${response.status}`);
  }
  return response.json();
};
