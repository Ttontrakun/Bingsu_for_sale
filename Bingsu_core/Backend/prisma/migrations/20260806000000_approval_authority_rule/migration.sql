-- ApprovalAuthorityRule: ตารางอำนาจอนุมัติ (structured lookup)
CREATE TABLE "ApprovalAuthorityRule" (
    "id" TEXT NOT NULL,
    "serviceKey" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "conditionKey" TEXT NOT NULL,
    "conditionLabel" TEXT,
    "minPct" DOUBLE PRECISION,
    "maxPct" DOUBLE PRECISION,
    "approverAbbr" TEXT NOT NULL,
    "approverFull" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApprovalAuthorityRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApprovalAuthorityRule_serviceKey_active_idx" ON "ApprovalAuthorityRule"("serviceKey", "active");
CREATE INDEX "ApprovalAuthorityRule_serviceKey_conditionKey_idx" ON "ApprovalAuthorityRule"("serviceKey", "conditionKey");

-- Seed: NT Dark Fiber (จากคู่มือส่งเสริมการขาย / ระเบียบ)
INSERT INTO "ApprovalAuthorityRule"
  ("id","serviceKey","serviceName","conditionKey","conditionLabel","minPct","maxPct","approverAbbr","approverFull","note","sortOrder","active","createdAt","updatedAt")
VALUES
  (
    'auth_df_le50',
    'dark_fiber',
    'NT Dark Fiber',
    'pct_le_50',
    'ส่วนลดไม่เกินร้อยละ 50 ของอัตรา Price List',
    0,
    50,
    'ชจญ.',
    'ผู้ช่วยกรรมการผู้จัดการใหญ่',
    'ชจญ.ที่รับผิดชอบงานขาย/บริการลูกค้า (ต้องผ่านความเห็น PM ก่อน)',
    10,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'auth_df_gt50_floor',
    'dark_fiber',
    'NT Dark Fiber',
    'pct_gt_50_floor',
    'ส่วนลดเกิน 50% แต่ไม่เกิน Floor Price',
    50.0001,
    NULL,
    'รจญ.',
    'รองกรรมการผู้จัดการใหญ่',
    'กรณีส่วนลดเกิน 50% แต่ไม่เกิน Floor Price ต้องผ่านความเห็น Product Manager และฝ่ายกรอบอัตราก่อน',
    20,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'auth_df_over_floor',
    'dark_fiber',
    'NT Dark Fiber',
    'over_floor',
    'ส่วนลดเกินอัตรา Floor Price',
    NULL,
    NULL,
    'กจญ.',
    'กรรมการผู้จัดการใหญ่',
    'เสนอขออนุมัติผ่านฝ่ายบริหารจัดการผลิตภัณฑ์ (PM)',
    30,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'auth_corp_le30',
    'corporate',
    'NT Corporate Internet',
    'pct_range',
    'ส่วนลดไม่เกิน 30% จากอัตราปกติ',
    0,
    30,
    'ผจก.',
    'ผู้จัดการ',
    'อำนาจระดับฝ่าย (ผจก.) ตามข้อ 2.1',
    10,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );
