-- Aplicação manual somente na Homologação.
-- Não executar no deploy automático nem na Produção.
-- CREATE INDEX CONCURRENTLY exige que o arquivo seja executado fora de uma transação externa.
DO $$
BEGIN
  IF current_database() <> 'portal_operacoes' THEN
    RAISE EXCEPTION 'Migração SB9 autorizada somente para portal_operacoes';
  END IF;
END
$$;

-- Caminho de leitura raw/fallback e scan por filial na reconstrução inicial.
CREATE INDEX CONCURRENTLY IF NOT EXISTS operational_sb9_batch_branch_date_product_idx
  ON public.operational_source_rows (batch_id, branch_code, event_date, product_code)
  INCLUDE (unit_value)
  WHERE branch_code IS NOT NULL AND branch_code <> ''
    AND product_code IS NOT NULL AND product_code <> ''
    AND event_date IS NOT NULL AND unit_value IS NOT NULL;

-- Caminho de leitura para pesquisa de um produto/agregado em várias filiais.
CREATE INDEX CONCURRENTLY IF NOT EXISTS operational_sb9_batch_product_branch_date_idx
  ON public.operational_source_rows (batch_id, product_code, branch_code, event_date)
  INCLUDE (unit_value)
  WHERE branch_code IS NOT NULL AND branch_code <> ''
    AND product_code IS NOT NULL AND product_code <> ''
    AND event_date IS NOT NULL AND unit_value IS NOT NULL;

ANALYZE public.operational_source_rows;

CREATE TABLE IF NOT EXISTS public.cost_evolution_sb9_versions (
  id uuid PRIMARY KEY,
  source_batch_id uuid NOT NULL REFERENCES public.operational_import_batches(id) ON DELETE RESTRICT,
  source_file_hash text NOT NULL,
  source_file_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('building', 'ready', 'failed')),
  source_rows integer NOT NULL DEFAULT 0 CHECK (source_rows >= 0),
  fact_rows integer NOT NULL DEFAULT 0 CHECK (fact_rows >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  error text
);

CREATE TABLE IF NOT EXISTS public.cost_evolution_sb9_monthly (
  version_id uuid NOT NULL REFERENCES public.cost_evolution_sb9_versions(id) ON DELETE CASCADE,
  branch_code text NOT NULL,
  product_code text NOT NULL,
  period text NOT NULL,
  unit_value numeric(20,6) NOT NULL,
  source_rows integer NOT NULL CHECK (source_rows > 0),
  PRIMARY KEY (version_id, branch_code, product_code, period),
  CHECK (branch_code <> ''),
  CHECK (product_code <> ''),
  CHECK (period ~ '^[0-9]{4}(0[1-9]|1[0-2])$'),
  CHECK (unit_value <> 'NaN'::numeric)
);

-- Auxilia consultas por período quando o usuário filtra todas as filiais.
CREATE INDEX IF NOT EXISTS cost_evolution_sb9_monthly_period_read_idx
  ON public.cost_evolution_sb9_monthly (version_id, period, branch_code, product_code)
  INCLUDE (unit_value);

CREATE TABLE IF NOT EXISTS public.cost_evolution_sb9_head (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version_id uuid NOT NULL REFERENCES public.cost_evolution_sb9_versions(id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.cost_evolution_sb9_versions TO portal_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_evolution_sb9_monthly TO portal_app;
    GRANT SELECT, INSERT, UPDATE ON public.cost_evolution_sb9_head TO portal_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app_homolog') THEN
    GRANT SELECT, INSERT, UPDATE ON public.cost_evolution_sb9_versions TO portal_app_homolog;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_evolution_sb9_monthly TO portal_app_homolog;
    GRANT SELECT, INSERT, UPDATE ON public.cost_evolution_sb9_head TO portal_app_homolog;
  END IF;
END
$$;

-- Consultas que filtram uma filial, um intervalo mensal e opcionalmente produtos.
CREATE INDEX IF NOT EXISTS cost_evolution_sb9_monthly_branch_period_product_idx
  ON public.cost_evolution_sb9_monthly (version_id, branch_code, period, product_code)
  INCLUDE (unit_value);

CREATE INDEX CONCURRENTLY IF NOT EXISTS operational_import_batches_sb9_latest_idx
  ON public.operational_import_batches (source_kind, status, imported_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS cost_evolution_sb9_versions_source_lookup_idx
  ON public.cost_evolution_sb9_versions (source_batch_id, source_file_hash, status);

CREATE INDEX IF NOT EXISTS cost_evolution_sb9_monthly_product_period_read_idx
  ON public.cost_evolution_sb9_monthly (version_id, product_code, period, branch_code)
  INCLUDE (unit_value);
