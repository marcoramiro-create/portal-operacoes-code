BEGIN;

DO $$
BEGIN
  IF current_database() <> 'portal_operacoes' THEN
    RAISE EXCEPTION 'Migração autorizada somente para portal_operacoes';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.purchase_sales_monthly_versions (
  id uuid PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('building', 'ready', 'failed')),
  source_fingerprint text NOT NULL,
  source_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_rows integer NOT NULL DEFAULT 0 CHECK (source_rows >= 0),
  fact_rows integer NOT NULL DEFAULT 0 CHECK (fact_rows >= 0),
  min_period text,
  max_period text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  error text
);

CREATE TABLE IF NOT EXISTS public.purchase_sales_monthly_facts (
  version_id uuid NOT NULL REFERENCES public.purchase_sales_monthly_versions(id) ON DELETE CASCADE,
  branch_code text NOT NULL,
  sales_code text NOT NULL,
  period text NOT NULL,
  quantity numeric NOT NULL,
  source_import_id integer NOT NULL REFERENCES public."protheusImports"(id),
  source_row_id integer NOT NULL REFERENCES public."inventoryAnalytics"(id),
  source_imported_at timestamptz NOT NULL,
  PRIMARY KEY (version_id, branch_code, sales_code, period),
  CHECK (branch_code <> ''),
  CHECK (sales_code <> ''),
  CHECK (period ~ '^[0-9]{4}(0[1-9]|1[0-2])$'),
  CHECK (quantity <> 'NaN'::numeric)
);

CREATE TABLE IF NOT EXISTS public.purchase_sales_monthly_head (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version_id uuid NOT NULL REFERENCES public.purchase_sales_monthly_versions(id)
);

-- A chave primária já é o índice de leitura por versão, filial, código e mês.
CREATE INDEX IF NOT EXISTS purchase_sales_monthly_versions_ready_idx
  ON public.purchase_sales_monthly_versions (status, published_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.purchase_sales_monthly_versions TO portal_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_sales_monthly_facts TO portal_app;
    GRANT SELECT, INSERT, UPDATE ON public.purchase_sales_monthly_head TO portal_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app_homolog') THEN
    GRANT SELECT, INSERT, UPDATE ON public.purchase_sales_monthly_versions TO portal_app_homolog;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_sales_monthly_facts TO portal_app_homolog;
    GRANT SELECT, INSERT, UPDATE ON public.purchase_sales_monthly_head TO portal_app_homolog;
  END IF;
END
$$;

COMMIT;
