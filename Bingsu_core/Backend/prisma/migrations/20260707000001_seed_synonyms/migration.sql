-- Seed คำพ้องความหมายเริ่มต้น (จากส่วนที่ 7 ของเอกสาร Master)
-- โครงสร้าง: term = คำในเอกสาร (คำทางการ) ; synonyms = คำที่คนพิมพ์จริงหลายแบบ (ภาษาพูด)
-- ระบบทำงานสองทิศทาง: พิมพ์คำไหนในกลุ่มก็ค้นเจอกันหมด
-- idempotent: ถ้ามี id เดิมอยู่แล้วจะไม่ซ้ำ (ON CONFLICT DO NOTHING)

INSERT INTO "Synonym" ("id", "term", "synonyms", "enabled", "note", "createdAt", "updatedAt") VALUES
  ('seed_syn_below_floor',  'เกินอัตรา floor price',    ARRAY['ต่ำกว่า floor', 'ต่ำกว่า floor price', 'หลุด floor', 'ขายต่ำกว่า floor', 'ต่ำกว่าราคาขั้นต่ำ'], true, 'ส่วนลดเกิน Floor Price → รจญ. (ข้อ 2.3)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_syn_not_below_floor', 'ไม่เกินอัตรา floor price', ARRAY['ไม่ต่ำกว่า floor', 'ยังไม่หลุด floor', 'สูงกว่า floor'], true, 'ส่วนลดไม่เกิน Floor Price → ชจญ. (ข้อ 2.2)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_syn_corp_internet', 'NT Corporate Internet',    ARRAY['เน็ตองค์กร', 'เน็ต corp', 'อินเทอร์เน็ตองค์กร'], true, 'ชื่อเรียกบริการแบบภาษาพูด', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_syn_cpe',          'ค่าเช่าอุปกรณ์ CPE',        ARRAY['ค่าเครื่อง', 'ค่าเราเตอร์', 'ค่าอุปกรณ์'], true, 'ค่าเช่าอุปกรณ์ปลายทาง', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_syn_normal_rate',  'อัตราปกติ',                 ARRAY['ราคาตั้ง', 'ราคาเต็ม', 'เรทปกติ', 'ราคาปกติ'], true, 'ราคาก่อนหักส่วนลด', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_syn_approver',     'ผู้มีอำนาจอนุมัติ',         ARRAY['ใครเซ็น', 'ใครอนุมัติได้', 'ต้องขอใคร', 'อำนาจใคร'], true, 'ถามชั้นผู้มีอำนาจอนุมัติ', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_syn_discount',     'ส่วนลดค่าบริการ',           ARRAY['เคาะราคา', 'ลดราคา', 'ขายถูกกว่าปกติ'], true, 'ภาษาพูดของการให้ส่วนลด', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
