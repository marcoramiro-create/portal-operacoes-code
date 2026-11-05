-- 0061: estrutura aditiva dos fatos mensais da Indústria na Produção.
-- As tabelas ficam vazias até a existência das fontes FECHAMENTO_ESTOQUE e ENTRADA_NF.
-- Não copia dados da Homologação e não altera Recebimento.
CREATE TABLE IF NOT EXISTS public.industry_consumption_versions (
  id uuid PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('building', 'ready', 'failed')),
  source_fingerprint text NOT NULL,
  source_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_rows integer NOT NULL DEFAULT 0 CHECK (source_rows >= 0),
  monthly_rows integer NOT NULL DEFAULT 0 CHECK (monthly_rows >= 0),
  stock_rows integer NOT NULL DEFAULT 0 CHECK (stock_rows >= 0),
  min_period text,
  max_period text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  error text
);

CREATE TABLE IF NOT EXISTS public.industry_consumption_monthly (
  version_id uuid NOT NULL REFERENCES public.industry_consumption_versions(id) ON DELETE CASCADE,
  branch_code text NOT NULL,
  aggregate_code text NOT NULL,
  period text NOT NULL,
  consumption_value numeric NOT NULL,
  PRIMARY KEY (version_id, branch_code, aggregate_code, period),
  CHECK (period ~ '^[0-9]{4}(0[1-9]|1[0-2])$'),
  CHECK (consumption_value <> 'NaN'::numeric)
);

CREATE TABLE IF NOT EXISTS public.industry_stock_monthly (
  version_id uuid NOT NULL REFERENCES public.industry_consumption_versions(id) ON DELETE CASCADE,
  branch_code text NOT NULL,
  product_code text NOT NULL,
  aggregate_code text NOT NULL,
  period text NOT NULL,
  stock_value numeric NOT NULL,
  PRIMARY KEY (version_id, branch_code, product_code, period),
  CHECK (period ~ '^[0-9]{4}(0[1-9]|1[0-2])$'),
  CHECK (stock_value <> 'NaN'::numeric)
);

CREATE TABLE IF NOT EXISTS public.industry_consumption_head (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version_id uuid NOT NULL REFERENCES public.industry_consumption_versions(id)
);

CREATE INDEX IF NOT EXISTS industry_consumption_monthly_read_idx
  ON public.industry_consumption_monthly (branch_code, period, aggregate_code, version_id);
CREATE INDEX IF NOT EXISTS industry_stock_monthly_read_idx
  ON public.industry_stock_monthly (branch_code, period, aggregate_code, product_code, version_id);
CREATE INDEX IF NOT EXISTS industry_consumption_versions_ready_idx
  ON public.industry_consumption_versions (status, published_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.industry_consumption_versions TO portal_app;
    GRANT SELECT, INSERT, UPDATE ON public.industry_consumption_monthly TO portal_app;
    GRANT SELECT, INSERT, UPDATE ON public.industry_stock_monthly TO portal_app;
    GRANT SELECT, INSERT, UPDATE ON public.industry_consumption_head TO portal_app;
  END IF;
END $$;
