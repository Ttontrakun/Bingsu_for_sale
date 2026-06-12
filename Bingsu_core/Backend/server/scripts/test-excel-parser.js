import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { extractExcelText } from "../services/excel.js";

const inputPath = process.argv[2];

const loadWorkbookBuffer = () => {
  if (inputPath) {
    const resolved = path.resolve(process.cwd(), inputPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${resolved}`);
    }
    return { buffer: fs.readFileSync(resolved), fileName: path.basename(resolved) };
  }

  const worksheet = XLSX.utils.aoa_to_sheet([
    ["No", "ชื่อรายการไทย", "technical_name"],
    [1, "ประเภทข้อมูล", "data_type"],
    [2, "ชื่อชุดข้อมูล", "title"],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  return {
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    fileName: "sample.xlsx",
  };
};

const { buffer, fileName } = loadWorkbookBuffer();
const parsed = extractExcelText({ buffer, fileName });

console.log(JSON.stringify({
  fileName,
  metadata: parsed.metadata,
  firstBlock: parsed.blocks[0] || null,
}, null, 2));
