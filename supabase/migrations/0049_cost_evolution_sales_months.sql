-- Preserva os 13 meses reais da exportação de Compras para análises mensais.
ALTER TABLE public."inventoryAnalytics"
  ADD COLUMN IF NOT EXISTS "salesMonths" jsonb NOT NULL DEFAULT '{}'::jsonb;
