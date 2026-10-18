-- 0051 (18/10/2026): índices econômicos oficiais — IPCA (IBGE/SIDRA) e dólar PTAX (BCB).
-- Cache mensal: o servidor busca apenas os meses faltantes nas APIs oficiais e
-- grava o snapshot aqui. Se a API estiver fora, a análise usa o último valor gravado.
CREATE TABLE IF NOT EXISTS public.economic_indices (
  id bigserial PRIMARY KEY,
  indice varchar(20) NOT NULL CHECK (indice IN ('IPCA', 'DOLAR')),
  period varchar(6) NOT NULL,
  valor numeric(14, 6) NOT NULL,
  valor_fechamento numeric(14, 6),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (indice, period)
);
CREATE INDEX IF NOT EXISTS economic_indices_indice_period_idx ON public.economic_indices (indice, period);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.economic_indices TO portal_app;
    GRANT USAGE, SELECT ON SEQUENCE economic_indices_id_seq TO portal_app;
  END IF;
END $$;