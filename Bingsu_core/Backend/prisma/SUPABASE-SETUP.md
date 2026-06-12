# เอา Prisma schema เข้า Supabase (เมื่อ migrate deploy เชื่อมไม่ได้)

ถ้า `npx prisma migrate deploy` ติด P1001 หรือ "Tenant or user not found" ให้สร้างตารางด้วย SQL เองใน Supabase ดังนี้

## ขั้นตอน

1. เปิด **Supabase Dashboard** → เลือกโปรเจกต์ของคุณ  
2. ไปที่ **SQL Editor**  
3. เปิดไฟล์ **`prisma/supabase-schema.sql`** ในโปรเจกต์นี้ แล้ว copy เนื้อหาทั้งหมด  
4. วางใน SQL Editor แล้วกด **Run**  
5. ถ้ารันสำเร็จ ตารางทั้งหมดของแอปจะถูกสร้างใน Supabase

## หลังรัน SQL แล้ว

- แอปจะใช้ Supabase ได้ (ให้ `DATABASE_URL` ใน `.env` / `.env.local` ชี้ไปที่ Supabase แล้ว)  
- ถ้าภายหลังเชื่อม Direct หรือ Pooler ได้แล้ว และอยากให้ Prisma รู้ว่า migration ถูก apply แล้ว ให้รัน (จากโฟลเดอร์ `askaa_backend`):

  ```bash
  npx prisma migrate resolve --applied 20260119061231_init
  npx prisma migrate resolve --applied 20260119065210_auth_init
  npx prisma migrate resolve --applied 20260119074430_bot_history
  npx prisma migrate resolve --applied 20260119085041_user_name_bot_knowledge
  npx prisma migrate resolve --applied 20260120051823_add_admin_upload
  npx prisma migrate resolve --applied 20260120054418_add_support_roles
  npx prisma migrate resolve --applied 20260120062922_support_approval
  npx prisma migrate resolve --applied 20260121032552_add_bot_fields
  npx prisma migrate resolve --applied 20260122030000_auth_tokens
  npx prisma migrate resolve --applied 20260122033000_document_share_roles
  npx prisma migrate resolve --applied 20260122034000_message_feedback
  npx prisma migrate resolve --applied 20260122043000_document_tags
  npx prisma migrate resolve --applied 20260203090000_integrations_stats
  npx prisma migrate resolve --applied 20260203103000_document_link
  npx prisma migrate resolve --applied 20260203113000_usage_tokens
  npx prisma migrate resolve --applied 20260209100000_user_avatar_url
  npx prisma migrate resolve --applied 20260214000000_bot_enabled
  ```

  (หรือรันทีละคำสั่งจนครบทุก migration)
