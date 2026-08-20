/**
 * แก้ / จัดรูปตาราง Markdown ให้ GFM เรนเดอร์ได้
 * - นับคอลัมน์รวมเซลล์ว่าง (ห้าม filter(Boolean))
 * - กู้แถวที่เคยถูกยุบด้วย <br>
 * - เติม separator และ pad คอลัมน์ให้เท่ากัน
 * - ไม่ยุบคอลัมน์เกินด้วย <br> (ทำให้ตารางพัง)
 */
const isPipeRow = (line) => /^\s*\|.*\|\s*$/.test(String(line || ''));

const splitTableRow = (line) => {
  const trimmed = String(line || '').trim();
  if (!trimmed.startsWith('|')) return null;
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((s) => s.trim());
};

const isSeparatorCells = (cells) =>
  Array.isArray(cells) &&
  cells.length > 0 &&
  cells.every((c) => c === '' || /^:?-{1,}:?$/.test(String(c).trim()));

const expandBrInCells = (cells) =>
  cells.flatMap((c) => String(c ?? '').split(/<br\s*\/?>/i).map((s) => s.trim()));

const cellsToLine = (cells) =>
  `| ${cells.map((c) => String(c ?? '').replace(/\s*\n+\s*/g, ' ').trim()).join(' | ')} |`;

export const normalizeMarkdownTable = (text) => {
  const lines = String(text ?? '').split(/\r?\n/);
  const out = [];
  let i = 0;

  while (i < lines.length) {
    if (!isPipeRow(lines[i])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    const rawRows = [];
    while (i < lines.length && isPipeRow(lines[i])) {
      rawRows.push(lines[i]);
      i += 1;
    }

    let rows = rawRows
      .map((line) => expandBrInCells(splitTableRow(line) || []))
      .filter((cells) => cells.length > 0);

    if (rows.length === 0 || (rows[0] || []).length < 2) {
      out.push(...rawRows);
      continue;
    }

    const numCols = Math.max(...rows.map((r) => r.length), 2);
    rows = rows.map((r) => {
      const next = r.slice(0, numCols);
      while (next.length < numCols) next.push('');
      return next;
    });

    if (!isSeparatorCells(rows[1] || [])) {
      rows.splice(1, 0, Array(numCols).fill('---'));
    } else {
      rows[1] = Array(numCols).fill('---');
    }

    for (const r of rows) out.push(cellsToLine(r));
  }

  return out.join('\n');
};

export default normalizeMarkdownTable;
