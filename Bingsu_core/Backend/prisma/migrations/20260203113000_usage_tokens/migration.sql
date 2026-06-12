-- Track token usage per day

ALTER TABLE "UsageDaily"
ADD COLUMN "promptTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "completionTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "totalTokens" INTEGER NOT NULL DEFAULT 0;

