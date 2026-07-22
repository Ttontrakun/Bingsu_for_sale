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

/**
 * หาแถว "หัวตาราง" จริง แทนที่จะเดาว่าแถวแรกที่มีข้อมูลคือหัวตาราง
 * ปัญหาเดิม: ไฟล์ที่มีแถวชื่อเรื่อง/เซลล์ merge อยู่บนสุด (พบบ่อยในไฟล์ไทย) ทำให้
 *   ระบบเอาแถวชื่อเรื่องมาเป็นหัวคอลัมน์ → คอลัมน์ที่เหลือกลายเป็น column_2, column_3...
 *   ชื่อคอลัมน์จริงหายหมด AI เลยไม่รู้ว่าค่าในแต่ละช่องคืออะไร → ตอบไม่ตรง
 * วิธีใหม่: มองแถวบนสุด ~8 แถว แล้วเลือก "แถวแรกที่เต็มความกว้าง"
 *   (จำนวนเซลล์ไม่ว่าง ≥ 70% ของแถวที่กว้างสุดในโซนบน) เป็นหัวตาราง
 *   แถวชื่อเรื่อง/แถวว่างที่อยู่เหนือหัวตารางจริงจะถูกข้ามไป
 */
const buildHeaderAndStart = (rows, lookahead = 8) => {
  const limit = Math.min(rows.length, lookahead);
  const counts = [];
  for (let i = 0; i < limit; i += 1) {
    counts.push(rows[i].map(normalizeCell).filter(Boolean).length);
  }
  const maxCount = Math.max(0, ...counts);
  if (maxCount === 0) return { header: [], headerRowIndex: -1 };
  const threshold = Math.max(2, Math.ceil(maxCount * 0.7));
  let hri = counts.findIndex((c) => c >= threshold);
  if (hri < 0) hri = counts.findIndex((c) => c > 0);

  const primary = rows[hri].map(normalizeCell);
  const width = primary.length;
  const firstIdx = primary.findIndex(Boolean);
  const hasGap = primary.slice(firstIdx).some((c) => !c); // มีช่องว่างหลังหัวแรก = อาจมี merged group

  // ตรวจว่าแถวถัดไปเป็น "หัวย่อยชั้นที่ 2" หรือไม่ (เช่น ตารางอำนาจอนุมัติ:
  //   แถวบน = "ตำแหน่งผู้มีอำนาจอนุมัติ" (merge) / แถวล่าง = กจญ. รจญ. ชจญ. ...)
  let subRowIndex = -1;
  if (hasGap && hri + 1 < rows.length) {
    const next = rows[hri + 1].map(normalizeCell);
    const nextNonEmpty = next.filter(Boolean);
    const fillsGap = next.some((c, i) => c && !primary[i]); // เติมช่องที่หัวหลักว่าง
    const allShort = nextNonEmpty.every((c) => c.length <= 25); // เป็น label สั้น ไม่ใช่ข้อความยาว (=ข้อมูล)
    if (nextNonEmpty.length >= 2 && fillsGap && allShort) subRowIndex = hri + 1;
  }

  if (subRowIndex < 0) {
    // หัวตารางชั้นเดียว
    const header = primary.map((cell, idx) => cell || `column_${idx + 1}`);
    return { header, headerRowIndex: hri };
  }

  // หัวตาราง 2 ชั้น: คลี่ merged group แนวนอน (forward-fill เฉพาะคอลัมน์ที่มีหัวย่อยด้านล่าง)
  // แล้วรวมเป็น "กลุ่ม - หัวย่อย" เพื่อให้ AI รู้ว่าค่าในช่องนั้นอยู่ใต้กลุ่มไหน
  const sub = rows[subRowIndex].map(normalizeCell);
  const w = Math.max(width, sub.length);
  let last = "";
  const header = [];
  for (let i = 0; i < w; i += 1) {
    if (primary[i]) last = primary[i];
    const group = primary[i] ? primary[i] : (sub[i] && i >= firstIdx ? last : "");
    const label = [group || "", sub[i] || ""].filter(Boolean).join(" - ");
    header[i] = label || `column_${i + 1}`;
  }
  return { header, headerRowIndex: subRowIndex };
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

    const { header, headerRowIndex } = buildHeaderAndStart(rows);
    if (!header.length || headerRowIndex < 0) continue;

    const startRowIndex = headerRowIndex;
    const dataRows = rows.slice(startRowIndex + 1, startRowIndex + 1 + MAX_SHEET_ROWS);
    const previewRows = [];

    dataRows.forEach((row, idx) => {
      const entries = header
        .map((colName, colIdx) => {
          const value = normalizeCell(row?.[colIdx]);
          if (!value) return null;
          // เครื่องหมายติ๊กในตาราง (P, /, x, ✓ ฯลฯ) = "ช่องนี้ใช่/มีค่า" ไม่ใช่ข้อความข้อมูล
          // แปลงให้ชัดเจน กัน AI อ่าน "P" เป็นตัวย่อตำแหน่ง
          if (/^[/\\xX✓✔✗●•√pP]$/.test(value)) {
            return `${colName}: ✓ (ใช่/มีอำนาจ)`;
          }
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
