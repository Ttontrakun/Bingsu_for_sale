-- Text style map for Dev Studio (color, background, size, bold, italic)
ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "styles" JSONB NOT NULL DEFAULT '{}'::jsonb;
