-- Add email verification and password reset fields
ALTER TABLE "User"
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN "emailVerificationToken" TEXT,
ADD COLUMN "emailVerificationExpiresAt" TIMESTAMP(3),
ADD COLUMN "passwordResetToken" TEXT,
ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_emailVerificationToken_key" ON "User"("emailVerificationToken");
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "User"("passwordResetToken");
