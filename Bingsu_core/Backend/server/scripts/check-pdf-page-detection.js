#!/usr/bin/env node
/**
 * ตรวจการแบ่งหน้า PDF ว่าหน้าไหนมี text layer หน้าไหนเป็นภาพ/สแกน
 * ใช้: node server/scripts/check-pdf-page-detection.js <path-to.pdf>
 */
import { readFile } from "node:fs/promises";
import { getPdfPageDetection } from "../services/uploadQueue.js";

const main = async () => {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: check-pdf-page-detection.js <path-to.pdf>");
    process.exit(2);
  }
  const buffer = await readFile(target);
  const { imagePageNumbers, textByPage, pageCount } = await getPdfPageDetection(buffer);
  console.log(`pageCount        : ${pageCount}`);
  console.log(`text layer pages : ${textByPage.map((p) => p.page).join(", ") || "-"}`);
  console.log(`image/scan pages : ${imagePageNumbers.join(", ") || "-"}`);
};

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
