-- Add feedback for messages
CREATE TYPE "MessageFeedbackRating" AS ENUM ('up', 'down');

CREATE TABLE "MessageFeedback" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rating" "MessageFeedbackRating" NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MessageFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessageFeedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MessageFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MessageFeedback_messageId_userId_key" ON "MessageFeedback"("messageId", "userId");
CREATE INDEX "MessageFeedback_userId_idx" ON "MessageFeedback"("userId");
