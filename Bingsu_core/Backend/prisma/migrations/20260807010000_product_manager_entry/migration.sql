-- ProductManagerEntry: Super PM / Product Manager (โครงสร้างใหม่)
CREATE TABLE IF NOT EXISTS "ProductManagerEntry" (
    "id" TEXT NOT NULL,
    "businessGroup" TEXT NOT NULL,
    "serviceGroup" TEXT NOT NULL,
    "serviceKey" TEXT,
    "superPmName" TEXT,
    "superPmTitle" TEXT,
    "superPmAbbr" TEXT,
    "pmName" TEXT,
    "pmTitle" TEXT,
    "pmAbbr" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductManagerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductManagerEntry_serviceKey_active_idx" ON "ProductManagerEntry"("serviceKey", "active");
CREATE INDEX IF NOT EXISTS "ProductManagerEntry_businessGroup_idx" ON "ProductManagerEntry"("businessGroup");

DELETE FROM "ProductManagerEntry";

INSERT INTO "ProductManagerEntry"
  ("id","businessGroup","serviceGroup","serviceKey","superPmName","superPmTitle","superPmAbbr","pmName","pmTitle","pmAbbr","sortOrder","active","createdAt","updatedAt")
VALUES
  ('pm_2fb04671016e432b', '1. Hard Infrastructure', '1.1 กลุ่มบริการท่อร้อยสาย และ Neutral Last Mile', 'duct_nlm', 'นายทินกร นาทองลาย', 'ผู้ช่วยกรรมการผู้จัดการใหญ่กลุ่มโครงสร้างพื้นฐาน', 'ชจญ.ฐฐ.', 'นายมาโนช บุญชื่น', 'ผู้จัดการฝ่ายท่อร้อยสาย', 'ผจก.ทฐฐ.', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_bb377a2a6f993e7d', '1. Hard Infrastructure', '1.2 กลุ่มบริการเสาโทรคมนาคม', 'tower', 'นายทินกร นาทองลาย', 'ผู้ช่วยกรรมการผู้จัดการใหญ่กลุ่มโครงสร้างพื้นฐาน', 'ชจญ.ฐฐ.', 'นายอนุวงศ์ วิชชุวาณิชย์', 'ผู้จัดการฝ่ายเสาโทรคมนาคม', 'ผจก.สฐฐ.', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_10c90794e7a101b6', '1. Hard Infrastructure', '1.3 กลุ่มบริการพัฒนาสินทรัพย์', 'asset_dev', 'นายธเนศ เฉลิมวัฒน์', 'ผู้ช่วยกรรมการผู้จัดการใหญ่กลุ่มธุรกิจใหม่', 'ชจญ.ธย.', 'นายไพโรจน์ ลิขิตธนเศรษฐ์', 'ผู้จัดการฝ่ายแสวงหาโอกาสและพัฒนาธุรกิจ', 'ผจก.พธย.', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_f5ef2c2e36eca8fd', '1. Hard Infrastructure', '1.4 กลุ่มบริการ Dark Fiber (เป็นการให้บริการเช่าใช้เส้นใยแก้วนำแสงในรูปแบบ Dark Fiber บนเส้นทางพื้นที่สาธารณะ)', 'dark_fiber', 'นายอภิชาติ สวรรค์คำธรณ์', 'ผู้ช่วยกรรมการผู้จัดการใหญ่กลุ่มสายและสื่อสัญญาณ', 'ชจญ.สส.', 'นายธนา ตั้งสิทธิ์ภักดี', 'ผู้จัดการฝ่ายสื่อสัญญาณ', 'ผจก.ญสส.', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_f55667e2beec3dc4', '2. International', '2.1 กลุ่มบริการ Connectivity', 'corporate', 'นายสรพงษ์ ศิริพันธุ์', 'รองกรรมการผู้จัดการใหญ่สายงานโทรคมนาคมและดาวเทียม', 'รจญ.ค.', 'น.ส.กวินนันทน์ ภัทร์ชนันท์', 'ผู้จัดการฝ่ายผลิตภัณฑ์สื่อสารข้อมูล', 'ผจก.สทค.', 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_bb87f2792deab841', '2. International', '2.2 กลุ่มบริการ IDD', 'idd', 'นายสรพงษ์ ศิริพันธุ์', 'รองกรรมการผู้จัดการใหญ่สายงานโทรคมนาคมและดาวเทียม', 'รจญ.ค.', 'นายประสิทธิ์ พรายงาม', 'ผู้จัดการฝ่ายผลิตภัณฑ์โทรศัพท์และบรอดแบนด์', 'ผจก.ททค.', 60, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_43fa1426a4b30391', '2. International', '2.3 กลุ่มบริการ IIG (International Internet Gateway)', 'iig', 'นายสรพงษ์ ศิริพันธุ์', 'รองกรรมการผู้จัดการใหญ่สายงานโทรคมนาคมและดาวเทียม', 'รจญ.ค.', 'น.ส.กวินนันทน์ ภัทร์ชนันท์', 'ผู้จัดการฝ่ายผลิตภัณฑ์สื่อสารข้อมูล', 'ผจก.สทค.', 70, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_a73a1417be257938', '3. Mobile', '3.1 กลุ่มบริการ 5G Solution', 'mobile_5g', 'นายณัฏฐวิทย์ สุฤทธิกุล', 'ผู้ช่วยกรรมการผู้จัดการใหญ่กลุ่มสื่อสารไร้สาย', 'ชจญ.รร.', 'นายสมศักดิ์ พึ่งธรรมเกิดผล', 'ผู้จัดการฝ่ายผลิตภัณฑ์สื่อสารไร้สายโครงข่ายเฉพาะ', 'ผจก.พรร.', 80, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_e7dbb459e494daf9', '3. Mobile', '3.2 กลุ่มบริการ Trunk Radio', 'trunk_radio', 'นายณัฏฐวิทย์ สุฤทธิกุล', 'ผู้ช่วยกรรมการผู้จัดการใหญ่กลุ่มสื่อสารไร้สาย', 'ชจญ.รร.', 'นายสมศักดิ์ พึ่งธรรมเกิดผล', 'ผู้จัดการฝ่ายผลิตภัณฑ์สื่อสารไร้สายโครงข่ายเฉพาะ', 'ผจก.พรร.', 90, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_74947246a61bf13a', '3. Mobile', '3.3 กลุ่มบริการ Mobile Retail', 'mobile_retail', 'นายณัฏฐวิทย์ สุฤทธิกุล', 'ผู้ช่วยกรรมการผู้จัดการใหญ่กลุ่มสื่อสารไร้สาย', 'ชจญ.รร.', 'นายพินิจ รัตนดิลก ณ ภูเก็ต', 'ผู้จัดการฝ่ายผลิตภัณฑ์สื่อสารไร้สาย', 'ผจก.ผรร.', 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_f457f9e49c3e2eb4', '4. Fixed Line & Broadband', '4.1 กลุ่มบริการ Internet Retail', 'internet_retail', 'นายสรพงษ์ ศิริพันธุ์', 'รองกรรมการผู้จัดการใหญ่สายงานโทรคมนาคมและดาวเทียม', 'รจญ.ค.', 'นายประสิทธิ์ พรายงาม', 'ผู้จัดการฝ่ายผลิตภัณฑ์โทรศัพท์และบรอดแบนด์', 'ผจก.ททค.', 110, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_c208e867b4b7e55b', '4. Fixed Line & Broadband', '4.2 กลุ่มบริการ Satellite', 'satellite', 'นายสรพงษ์ ศิริพันธุ์', 'รองกรรมการผู้จัดการใหญ่สายงานโทรคมนาคมและดาวเทียม', 'รจญ.ค.', 'นายอานุภาพ ลุจนานนท์', 'ผู้จัดการฝ่ายธุรกิจดาวเทียม', 'ผจก.ดทค.', 120, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_ceaf1df0ced739e7', '4. Fixed Line & Broadband', '4.3 กลุ่มบริการ Fixed Line', 'fixed_line', 'นายสรพงษ์ ศิริพันธุ์', 'รองกรรมการผู้จัดการใหญ่สายงานโทรคมนาคมและดาวเทียม', 'รจญ.ค.', 'นายประสิทธิ์ พรายงาม', 'ผู้จัดการฝ่ายผลิตภัณฑ์โทรศัพท์และบรอดแบนด์', 'ผจก.ททค.', 130, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_31c3c7969b806334', '4. Fixed Line & Broadband', '4.4 กลุ่มบริการ Datacom', 'carrier_mpls', 'นายสรพงษ์ ศิริพันธุ์', 'รองกรรมการผู้จัดการใหญ่สายงานโทรคมนาคมและดาวเทียม', 'รจญ.ค.', 'น.ส.กวินนันทน์ ภัทร์ชนันท์', 'ผู้จัดการฝ่ายผลิตภัณฑ์สื่อสารข้อมูล', 'ผจก.สทค.', 140, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_6c1d07862f455a36', '5. Digital', '5.1 กลุ่มบริการ Data Center & IX', 'data_center', 'นายยุทธศาสตร์ นิธิไพจิตร', 'ผู้ช่วยกรรมการผู้จัดการใหญ่กลุ่มดิจิทัล', 'ชจญ.ดจ.', 'นายสมภพ ลือพรมมาศ', 'ผู้จัดการฝ่ายผลิตภัณฑ์ศูนย์ข้อมูล', 'ผจก.ขดจ.', 150, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_ba16678d9c2a44e4', '5. Digital', '5.2 กลุ่มบริการ Cloud & Big Data', 'cloud_bigdata', 'นายยุทธศาสตร์ นิธิไพจิตร', 'ผู้ช่วยกรรมการผู้จัดการใหญ่กลุ่มดิจิทัล', 'ชจญ.ดจ.', 'นายสุรินทร์ แท่นรัตน์', 'ผู้จัดการฝ่ายผลิตภัณฑ์คลาวด์และบิ๊กดาต้า', 'ผจก.บดจ.', 160, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_aa44a25a71bcc195', '5. Digital', '5.3 กลุ่มบริการ Cybersecurity', 'cybersecurity', 'นายยุทธศาสตร์ นิธิไพจิตร', 'ผู้ช่วยกรรมการผู้จัดการใหญ่กลุ่มดิจิทัล', 'ชจญ.ดจ.', 'น.ส.กัณณิกา วรคามิน', 'ผู้จัดการฝ่ายผลิตภัณฑ์ความปลอดภัยไซเบอร์', 'ผจก.ภดจ.', 170, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_5cf780fb62d090c5', '5. Digital', '5.3 กลุ่มบริการ CCTV', 'cybersecurity', 'นายยุทธศาสตร์ นิธิไพจิตร', 'ผู้ช่วยกรรมการผู้จัดการใหญ่กลุ่มดิจิทัล', 'ชจญ.ดจ.', 'น.ส.กัณณิกา วรคามิน', 'ผู้จัดการฝ่ายผลิตภัณฑ์ความปลอดภัยไซเบอร์', 'ผจก.ภดจ.', 180, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_0778cb2202a20b5b', '5. Digital', '5.4 กลุ่มบริการ Application & Digital Services', NULL, 'นายยุทธศาสตร์ นิธิไพจิตร', 'ผู้ช่วยกรรมการผู้จัดการใหญ่กลุ่มดิจิทัล', 'ชจญ.ดจ.', 'นายจิตภัทร บุนนาค', 'ผู้จัดการฝ่ายผลิตภัณฑ์ดิจิทัล', 'ผจก.จดจ.', 190, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_6cd60a9f9c91ace1', '5. Digital', '5.5 กลุ่มบริการ Data Interchange', NULL, 'นายยุทธศาสตร์ นิธิไพจิตร', 'ผู้ช่วยกรรมการผู้จัดการใหญ่กลุ่มดิจิทัล', 'ชจญ.ดจ.', 'นายสมพงษ์ อัศวบุญมี', 'ผู้จัดการฝ่ายผลิตภัณฑ์แลกเปลี่ยนข้อมูลดิจิทัล', 'ผจก.มดจ.', 200, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_665711bf766af415', '6. ICT Solution', '6.1 กลุ่มบริการ Solution and Manage Service', NULL, 'นายเอกชัย กองเกิด', 'ผู้ช่วยกรรมการผู้จัดการใหญ่กลุ่มโซลูชั่นและเทคนิคบริการลูกค้าองค์กร', 'ชจญ.บธ.', 'น.ส.ศรีวรรณ สวัสดิ์อำไพรักษ์', 'ผู้จัดการฝ่ายกลยุทธ์ธุรกิจลูกค้าองค์กรและผลิตภัณฑ์โซลูชั่น', 'ผจก.กบธ.', 210, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_1bfd252896d07437', '6. ICT Solution', '6.2 กลุ่มบริการ Contact Center', 'contact_center', 'นายยุทธศาสตร์ นิธิไพจิตร', 'ผู้ช่วยกรรมการผู้จัดการใหญ่กลุ่มดิจิทัล', 'ชจญ.ดจ.', 'น.ส.มรกต อภิญญาณกุล', 'ผู้จัดการฝ่ายพัฒนาแอปพลิเคชัน', 'ผจก.อดจ.', 220, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pm_758065fa4dfdaf23', '6. ICT Solution', '6.3 กลุ่มบริการ ICT Solution & Platform', NULL, 'นายยุทธศาสตร์ นิธิไพจิตร', 'ผู้ช่วยกรรมการผู้จัดการใหญ่กลุ่มดิจิทัล', 'ชจญ.ดจ.', 'น.ส.มรกต อภิญญาณกุล', 'ผู้จัดการฝ่ายพัฒนาแอปพลิเคชัน', 'ผจก.อดจ.', 230, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
