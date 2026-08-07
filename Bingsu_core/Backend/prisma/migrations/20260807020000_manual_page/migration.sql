-- Manual page content for Supportadmin (editable JSON tree)
CREATE TABLE "ManualPage" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ManualPage_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ManualPage" ("id", "payload", "updatedAt")
VALUES (
  'default',
  $json${
    "documents": [
      {
        "id": "form",
        "type": "content",
        "title": "แบบฟอร์มบันทึก",
        "description": "รวมแบบฟอร์มการใช้งานที่เกี่ยวข้องกับระบบ Enterprise AI Chatbot",
        "iconKey": "form",
        "iconBg": "bg-yellow-100",
        "iconColor": "text-yellow-500",
        "subcategories": [
          {
            "id": "form-trial",
            "title": "แบบฟอร์มขอทดลองใช้งาน Enterprise AI Chatbot",
            "content": [{ "type": "pdf", "file": "/Enterprise AI Chatbot Trial Request Form.pdf" }]
          },
          {
            "id": "form-issue",
            "title": "แบบฟอร์มสำหรับแจ้งปัญหาการใช้งาน Enterprise AI Chatbot",
            "content": [{ "type": "pdf", "file": "/Enterprise AI Chatbot Issue Report Form.pdf" }]
          },
          {
            "id": "form-poc",
            "title": "แบบฟอร์มสำหรับขอข้อมูล POC ของ Enterprise AI Chatbot",
            "content": [{ "type": "pdf", "file": "/Enterprise AI Chatbot POC Request.pdf" }]
          },
          {
            "id": "form-tech-issue",
            "title": "แบบฟอร์มแจ้งปัญหาการใช้งานด้านเทคนิค",
            "content": [{ "type": "pdf", "file": "/Enterprise AI Chatbot Technical Issue Report Form.pdf" }]
          }
        ]
      },
      {
        "id": "manual",
        "type": "content",
        "title": "คู่มือการใช้งาน",
        "description": "คู่มือการใช้งานระบบอย่างละเอียด",
        "iconKey": "manual",
        "iconBg": "bg-blue-100",
        "iconColor": "text-blue-500",
        "subcategories": [
          {
            "id": "manual-getting-started",
            "title": "เริ่มต้นใช้งาน",
            "content": [
              { "type": "text", "value": "ขั้นตอนการเริ่มต้นใช้งานระบบ Enterprise AI Chatbot Support & Admin" },
              { "type": "list", "items": ["สร้างบัญชีผู้ใช้งาน", "ตั้งค่าโปรไฟล์", "เชื่อมต่อบอท", "จัดการฐานความรู้"] }
            ]
          },
          {
            "id": "manual-features",
            "title": "ฟีเจอร์หลัก",
            "content": [
              { "type": "text", "value": "ฟีเจอร์และความสามารถต่างๆ ของระบบ" },
              { "type": "list", "items": ["การจัดการบอท", "ระบบ Knowledge Base", "แดชบอร์ดและรายงาน", "การจัดการผู้ใช้"] }
            ]
          },
          {
            "id": "manual-troubleshooting",
            "title": "แก้ไขปัญหา",
            "content": [
              { "type": "text", "value": "วิธีแก้ไขปัญหาที่พบบ่อย" },
              { "type": "list", "items": ["บอทไม่ตอบสนอง", "ปัญหาการเชื่อมต่อ", "ข้อผิดพลาดในการอัปโหลด", "ติดต่อฝ่ายสนับสนุน"] }
            ]
          }
        ]
      },
      {
        "id": "pricing",
        "type": "content",
        "title": "ราคา",
        "description": "รายละเอียดราคาและแพ็คเกจต่างๆ",
        "iconKey": "pricing",
        "iconBg": "bg-green-100",
        "iconColor": "text-green-500",
        "subcategories": [
          {
            "id": "pricing-basic",
            "title": "แพ็คเกจ Basic",
            "content": [
              { "type": "price", "value": "฿999/เดือน" },
              { "type": "list", "items": ["1 บอท", "1,000 conversations/เดือน", "ฐานความรู้ 100 MB", "รองรับพื้นฐาน"] }
            ]
          },
          {
            "id": "pricing-pro",
            "title": "แพ็คเกจ Pro",
            "content": [
              { "type": "price", "value": "฿2,999/เดือน" },
              { "type": "list", "items": ["5 บอท", "10,000 conversations/เดือน", "ฐานความรู้ 1 GB", "รองรับ 24/7", "วิเคราะห์ขั้นสูง"] }
            ]
          },
          {
            "id": "pricing-enterprise",
            "title": "แพ็คเกจ Enterprise",
            "content": [
              { "type": "price", "value": "ติดต่อเรา" },
              { "type": "list", "items": ["บอทไม่จำกัด", "Conversations ไม่จำกัด", "ฐานความรู้ไม่จำกัด", "รองรับเฉพาะทาง", "ปรับแต่งได้เต็มรูปแบบ"] }
            ]
          }
        ]
      },
      {
        "id": "presentation",
        "type": "content",
        "title": "สไลด์นำเสนอ",
        "description": "สไลด์นำเสนอข้อมูลระบบ",
        "iconKey": "presentation",
        "iconBg": "bg-purple-100",
        "iconColor": "text-purple-500",
        "subcategories": [
          {
            "id": "presentation-overview",
            "title": "ภาพรวมระบบ",
            "content": [
              { "type": "text", "value": "แนะนำระบบ Enterprise AI Chatbot Support & Admin" },
              { "type": "list", "items": ["ระบบ AI Chatbot อัจฉริยะ", "รองรับหลายช่องทาง", "จัดการง่าย ใช้งานสะดวก", "รายงานและวิเคราะห์แบบ Real-time"] }
            ]
          },
          {
            "id": "presentation-benefits",
            "title": "ประโยชน์และข้อดี",
            "content": [
              { "type": "text", "value": "ประโยชน์ที่คุณจะได้รับ" },
              { "type": "list", "items": ["ลดต้นทุนการบริการลูกค้า", "ตอบคำถามอัตโนมัติ 24/7", "เพิ่มประสิทธิภาพทีมงาน", "ข้อมูลเชิงลึกเพื่อการตัดสินใจ"] }
            ]
          },
          {
            "id": "presentation-demo",
            "title": "ตัวอย่างการใช้งาน",
            "content": [
              { "type": "text", "value": "กรณีศึกษาและตัวอย่างการใช้งานจริง" },
              { "type": "list", "items": ["E-commerce Support", "การบริการลูกค้า", "ศูนย์ช่วยเหลือภายใน", "Lead Generation"] }
            ]
          }
        ]
      }
    ]
  }$json$::jsonb,
  CURRENT_TIMESTAMP
);
