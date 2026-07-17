-- โหมดส่วนตัว: เก็บเนื้อหาที่ผู้ใช้กรอกเอง ระดับ user (จำข้ามแชท)
CREATE TABLE "PrivateContext" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PrivateContext_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivateContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PrivateContext_userId_key" ON "PrivateContext"("userId");
