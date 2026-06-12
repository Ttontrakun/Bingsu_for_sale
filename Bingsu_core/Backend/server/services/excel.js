import * as XLSX from "xlsx";

const MAX_SHEET_ROWS = Number(process.env.EXCEL_MAX_ROWS_PER_SHEET || 5000);
const MAX_CELL_TEXT_LENGTH = Number(process.env.EXCEL_MAX_CELL_LENGTH || 500);
const MAX_PREVIEW_ROWS_PER_SHEET = Number(process.env.EXCEL_PREVIEW_ROWS_PER_SHEET || 200);

const normalizeCell = (value) => {
  if (value == null) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length > MAX_CELL_TEXT_LENGTH) {
    return `${text.slice(0, MAX_CELL_TEXT_LENGTH)}...`;
  }
  return text;
};

const normalizeFileExt = (fileName = "") => {
  const lower = String(fileName || "").toLowerCase();
  const lastDot = lower.lastIndexOf(".");
  if (lastDot < 0) return "";
  return lower.slice(lastDot);
};

export const isExcelFile = ({ fileName = "", contentType = "" } = {}) => {
  const ext = normalizeFileExt(fileName);
  if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") return true;
  const type = String(contentType || "").toLowerCase();
  return (
    type.includes("spreadsheetml") ||
    type.includes("ms-excel") ||
    type === "text/csv" ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "application/vnd.ms-excel"
  );
};

const buildHeader = (rows) => {
  for (const row of rows) {
    const cleaned = row.map(normalizeCell);
    const nonEmpty = cleaned.filter(Boolean);
    if (!nonEmpty.length) continue;
    return cleaned.map((cell, idx) => cell || `column_${idx + 1}`);
  }
  return [];
};

export const extractExcelText = ({ buffer, fileName = "file.xlsx" }) => {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    dense: true,
  });

  const blocks = [];
  const allRows = [];
  const previewSheets = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const header = buildHeader(rows);
    if (!header.length) continue;

    const startRowIndex = rows.findIndex((row) => row.some((cell) => normalizeCell(cell)));
    const dataRows = rows.slice(Math.max(0, startRowIndex + 1), Math.max(0, startRowIndex + 1) + MAX_SHEET_ROWS);
    const previewRows = [];

    dataRows.forEach((row, idx) => {
      const entries = header
        .map((colName, colIdx) => {
          const value = normalizeCell(row?.[colIdx]);
          if (!value) return null;
          return `${colName}: ${value}`;
        })
        .filter(Boolean);
      if (!entries.length) return;

      const humanRowNumber = startRowIndex + 2 + idx;
      const rowText = `Sheet ${sheetName} | Row ${humanRowNumber} | ${entries.join(" | ")}`;
      allRows.push(rowText);
      blocks.push({
        label: `${sheetName} • Row ${humanRowNumber}`,
        text: rowText,
      });
      if (previewRows.length < MAX_PREVIEW_ROWS_PER_SHEET) {
        const rowObject = {};
        header.forEach((colName, colIdx) => {
          rowObject[colName] = normalizeCell(row?.[colIdx]);
        });
        previewRows.push(rowObject);
      }
    });

    previewSheets.push({
      name: sheetName,
      columns: header,
      rows: previewRows,
    });
  }

  return {
    name: fileName,
    text: allRows.join("\n"),
    blocks,
    metadata: {
      parser: "xlsx",
      sheetCount: workbook.SheetNames.length,
      rowCount: blocks.length,
      previewSheets,
    },
  };
};
