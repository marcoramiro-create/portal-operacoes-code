ALTER TABLE "inventoryAnalytics" ADD COLUMN IF NOT EXISTS "salesMonths" jsonb NOT NULL DEFAULT '{}'::jsonb;
