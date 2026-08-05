/**
 * Pure helper สำหรับหน้าเพิ่มข้อมูล Knowledge (แปลงตาราง markdown/preview sheet, ตรวจไฟล์, จัดรูปแบบ)
 * ย้ายมาจาก pages/AddKnowledgeData.js (refactor แยกไฟล์ ไม่เปลี่ยนพฤติกรรม)
 */

export const parseMarkdownTableSheets = (inputText = '') => {
  const text = String(inputText || '');
  if (!text.trim()) return [];

  const parseTableLines = (tableLines, sheetName, fallbackIndex) => {
    if (!Array.isArray(tableLines) || tableLines.length < 2) return null;
    const rows = tableLines
      .map((line) => {
        const safeLine = String(line || '').trim().replace(/\\\|/g, '__PIPE__');
        if (!safeLine.startsWith('|') || !safeLine.endsWith('|')) return [];
        return safeLine
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim().replace(/__PIPE__/g, '|'));
      })
      .filter((row) => row.length > 0);
    if (rows.length < 2) return null;

    const columns = rows[0].map((cell) => String(cell || '').trim());
    if (!columns.length || columns.every((cell) => !cell)) return null;

    let bodyRows = rows.slice(1);
    if (
      bodyRows.length > 0 &&
      bodyRows[0].length === columns.length &&
      bodyRows[0].every((cell) => /^:?-{3,}:?$/.test(String(cell || '').trim()))
    ) {
      bodyRows = bodyRows.slice(1);
    }

    const rowObjects = bodyRows.map((row) => {
      const output = {};
      columns.forEach((column, colIdx) => {
        output[column] = String(row[colIdx] ?? '');
      });
      return output;
    });

    return {
      name: sheetName || `Sheet ${fallbackIndex + 1}`,
      columns,
      rows: rowObjects,
    };
  };

  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const sheets = [];
  let currentSheetName = 'Sheet 1';
  let tableBuffer = [];

  const flushBuffer = () => {
    const parsed = parseTableLines(tableBuffer, currentSheetName, sheets.length);
    if (parsed) sheets.push(parsed);
    tableBuffer = [];
  };

  lines.forEach((line) => {
    const sheetMatch = line.match(/^#{1,6}\s*Sheet:\s*(.+)$/i);
    if (sheetMatch) {
      flushBuffer();
      currentSheetName = sheetMatch[1].trim() || `Sheet ${sheets.length + 1}`;
      return;
    }
    if (/^\|.+\|$/.test(line)) {
      tableBuffer.push(line);
      return;
    }
    flushBuffer();
  });
  flushBuffer();

  return sheets;
};

// Get file type icon and label
export const getFileTypeInfo = (fileName) => {
  const extension = fileName.toLowerCase().split('.').pop();
  const typeMap = {
    'pdf': { icon: '📄', label: 'PDF', color: 'text-red-600' },
    'png': { icon: '🖼️', label: 'Image', color: 'text-blue-600' },
    'jpg': { icon: '🖼️', label: 'Image', color: 'text-blue-600' },
    'jpeg': { icon: '🖼️', label: 'Image', color: 'text-blue-600' },
    'gif': { icon: '🖼️', label: 'Image', color: 'text-blue-600' },
    'txt': { icon: '📝', label: 'Text', color: 'text-gray-600' },
    'doc': { icon: '📘', label: 'Word', color: 'text-blue-700' },
    'docx': { icon: '📘', label: 'Word', color: 'text-blue-700' },
    'xlsx': { icon: '📊', label: 'Excel', color: 'text-green-700' },
    'xls': { icon: '📊', label: 'Excel', color: 'text-green-700' },
    'csv': { icon: '📑', label: 'CSV', color: 'text-emerald-700' },
  };
  return typeMap[extension] || { icon: '📎', label: extension.toUpperCase(), color: 'text-gray-600' };
};

// Get PDF page count from OCR result (if available)
export const getPDFPageCount = (file) => {
  // Check if OCR result contains page information
  if (file.pages && Array.isArray(file.pages) && file.pages.length > 0) {
    return file.pages.length;
  }
  // Check if blocks contain page info
  if (file.blocks && Array.isArray(file.blocks)) {
    const pageBlocks = file.blocks.filter(b => b.page);
    if (pageBlocks.length > 0) {
      const maxPage = Math.max(...pageBlocks.map(b => b.page || 0));
      return maxPage;
    }
  }
  return null;
};

// Format processing time
export const formatProcessingTime = (seconds) => {
  if (!seconds) return null;
  if (seconds < 60) {
    return `${Math.round(seconds)} วินาที`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes} นาที ${secs} วินาที`;
};

export const isSupportedUploadFile = (file) => {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  return (
    name.endsWith('.pdf') ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv') ||
    type === 'application/pdf' ||
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    type === 'application/vnd.ms-excel' ||
    type === 'text/csv'
  );
};

// ตรวจสอบไฟล์ก่อนเพิ่ม
export const validateFile = (file) => {
  const maxSize = 5 * 1024 * 1024; // 5 MB in bytes
  
  if (!file) {
    return { valid: false, message: 'กรุณาเลือกไฟล์' };
  }

  if (!isSupportedUploadFile(file)) {
    return { 
      valid: false, 
      message: 'รองรับไฟล์ PDF, XLSX, XLS และ CSV เท่านั้น' 
    };
  }

  if (file.size > maxSize) {
    return { 
      valid: false, 
      message: `ขนาดไฟล์เกิน 5 MB (ขนาดไฟล์: ${(file.size / 1024 / 1024).toFixed(2)} MB)` 
    };
  }

  return { valid: true, message: '' };
};

export const flattenBlocksToText = (file) => {
  const t = (file.text || file.content || '').trim();
  if (t) return t;
  const blocks = file.blocks;
  if (!Array.isArray(blocks) || !blocks.length) return '';
  return blocks.map((b) => (b?.text ?? '').trim()).filter(Boolean).join('\n\n').trim();
};

export const clonePreviewSheets = (sheets = []) =>
  (Array.isArray(sheets) ? sheets : []).map((sheet) => ({
    name: String(sheet?.name || ''),
    columns: Array.isArray(sheet?.columns) ? sheet.columns.map((col) => String(col || '')) : [],
    rows: Array.isArray(sheet?.rows)
      ? sheet.rows.map((row) => {
          const output = {};
          if (row && typeof row === 'object' && !Array.isArray(row)) {
            Object.entries(row).forEach(([key, value]) => {
              output[String(key)] = String(value ?? '');
            });
          }
          return output;
        })
      : [],
  }));

export const hasExcelPreviewSheets = (file) =>
  Array.isArray(file?.metadata?.previewSheets) && file.metadata.previewSheets.length > 0;

export const escapeTableCell = (value) =>
  String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();

export const buildSheetMarkdownTable = (sheet = {}) => {
  const columns = Array.isArray(sheet?.columns) ? sheet.columns : [];
  const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
  if (!columns.length) return '';
  const header = `| ${columns.map((col) => escapeTableCell(col)).join(' | ')} |`;
  const separator = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => {
    const cells = columns.map((column) => escapeTableCell(row?.[column]));
    return `| ${cells.join(' | ')} |`;
  });
  return [`### Sheet: ${sheet?.name || 'Sheet'}`, header, separator, ...body].join('\n');
};

export const buildSourceFromPreviewSheets = (sheets = []) => {
  const cleanedSheets = clonePreviewSheets(sheets);
  const lines = [];
  const blocks = [];
  cleanedSheets.forEach((sheet) => {
    const tableText = buildSheetMarkdownTable(sheet);
    if (!tableText) return;
    lines.push(tableText);
    blocks.push({
      label: `${sheet?.name || 'Sheet'} • Table`,
      text: tableText,
    });
  });
  return {
    text: lines.join('\n'),
    blocks,
    previewSheets: cleanedSheets,
  };
};

// รวมตาราง (ที่แก้แล้วใน sheet editor) กลับเข้าไปใน "ข้อความเต็ม" โดยคงข้อความ (prose) รอบๆ ตารางไว้
// แทนที่บล็อกตารางเดิมในข้อความด้วยตารางที่สร้างใหม่ทีละบล็อกตามลำดับ ส่วนบรรทัดที่ไม่ใช่ตารางคงไว้เหมือนเดิม
export const mergeSheetsIntoText = (originalText, sheets) => {
  const src = String(originalText || '');
  const sheetList = Array.isArray(sheets) ? sheets : [];
  if (sheetList.length === 0) return src;
  const isTableLine = (line) => /^\|.+\|$/.test(String(line || '').trim());
  const buildPlainTable = (sheet = {}) => {
    const columns = Array.isArray(sheet?.columns) ? sheet.columns : [];
    const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
    if (!columns.length) return '';
    const header = `| ${columns.map((col) => escapeTableCell(col)).join(' | ')} |`;
    const separator = `| ${columns.map(() => '---').join(' | ')} |`;
    const body = rows.map((row) => `| ${columns.map((column) => escapeTableCell(row?.[column])).join(' | ')} |`);
    return [header, separator, ...body].join('\n');
  };
  const lines = src.split(/\r?\n/);
  const out = [];
  let sheetIdx = 0;
  let i = 0;
  while (i < lines.length) {
    if (isTableLine(lines[i])) {
      const blockLines = [];
      while (i < lines.length && isTableLine(lines[i])) {
        blockLines.push(lines[i]);
        i += 1;
      }
      if (sheetIdx < sheetList.length) {
        const rebuilt = buildPlainTable(sheetList[sheetIdx]);
        out.push(rebuilt || blockLines.join('\n'));
        sheetIdx += 1;
      } else {
        out.push(blockLines.join('\n'));
      }
    } else {
      out.push(lines[i]);
      i += 1;
    }
  }
  return out.join('\n');
};

/** แปลงข้อความเป็นโครงสร้างตารางเฉพาะเมื่อมีตัวแบ่งชัด (| markdown, tab, ช่องว่าง 2+ ตัว) — ไม่เดาจากทุก N บรรทัด */
export const parseContentForDisplay = (text) => {
  if (!text || !text.trim()) return { type: 'empty', content: '', blocks: [] };
  const blocks = [];
  const allLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!allLines.length) return { type: 'empty', content: '', blocks: [] };

  const splitTableLine = (line) => {
    if (line.includes('\t')) return line.split(/\t/).map(c => c.trim());
    const bySpaces = line.split(/\s{2,}/).map(c => c.trim());
    return bySpaces.length >= 2 ? bySpaces : [];
  };
  const lineHasMultipleCols = (line) => splitTableLine(line).length >= 2;

  const tryTable = (lines) => {
    if (!lines.length) return null;
    const markdownRows = lines.filter(l => /^\|.+\|/.test(l)).map(l =>
      l.split(/\|/).slice(1, -1).map(c => c.trim())
    );
    if (markdownRows.length >= 2) return { rows: markdownRows };
    const rows = lines.map(l => splitTableLine(l)).filter(r => r.length >= 2);
    if (rows.length < 2) return null;
    const colCounts = rows.map(r => r.length);
    const maxCols = Math.max(...colCounts);
    const minCols = Math.min(...colCounts);
    if (minCols < 2 || maxCols - minCols > 1) return null;
    const padded = rows.map(r => {
      const arr = [...r];
      while (arr.length < maxCols) arr.push('');
      return arr;
    });
    return { rows: padded };
  };

  let i = 0;
  while (i < allLines.length) {
    const line = allLines[i];
    if (/^\|.+\|/.test(line)) {
      const tableLines = [];
      while (i < allLines.length && /^\|.+\|/.test(allLines[i])) {
        tableLines.push(allLines[i]);
        i++;
      }
      const t = tryTable(tableLines);
      if (t) blocks.push({ type: 'table', rows: t.rows });
      else blocks.push({ type: 'text', content: tableLines.join('\n') });
      continue;
    }
    if (!lineHasMultipleCols(line)) {
      const textRun = [];
      while (i < allLines.length && !lineHasMultipleCols(allLines[i]) && !/^\|.+\|/.test(allLines[i])) {
        textRun.push(allLines[i]);
        i++;
      }
      blocks.push({ type: 'text', content: textRun.join('\n') });
      continue;
    }
    const run = [];
    while (i < allLines.length && lineHasMultipleCols(allLines[i])) {
      run.push(allLines[i]);
      i++;
    }
    const t = tryTable(run);
    if (t) blocks.push({ type: 'table', rows: t.rows });
    else blocks.push({ type: 'text', content: run.join('\n') });
  }
  return { type: 'blocks', blocks: blocks.length ? blocks : [{ type: 'text', content: text }] };
};

/** แถวสำหรับตารางดูผล OCR แบบ Typhoon (รองรับคีย์หลายแบบจาก API) */
export const buildOcrBlockRows = (blocks) => {
  if (!Array.isArray(blocks) || !blocks.length) return [];
  return blocks
    .map((b, i) => {
      const pageRaw = b.page ?? b.page_num ?? b.pageNumber;
      const page =
        pageRaw === undefined || pageRaw === null || pageRaw === ''
          ? ''
          : String(pageRaw);
      const label = String(b.label ?? b.type ?? b.role ?? '').trim() || '—';
      const text = String(b.text ?? b.content ?? '').trim();
      return { idx: i + 1, page, label, text };
    })
    .filter((r) => r.text);
};
