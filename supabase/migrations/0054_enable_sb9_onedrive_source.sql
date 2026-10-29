-- Habilita a SB9 como fonte operacional própria.
-- Homologação somente: não aplicar automaticamente em Produção.
BEGIN;

DO $$
BEGIN
  IF current_database() <> 'portal_operacoes' THEN
    RAISE EXCEPTION 'Migração autorizada somente para portal_operacoes (Homologação)';
  END IF;
END $$;

ALTER TABLE public.operational_import_batches
  DROP CONSTRAINT IF EXISTS operational_import_batches_source_kind_check;
ALTER TABLE public.operational_import_batches
  ADD CONSTRAINT operational_import_batches_source_kind_check
  CHECK (source_kind IN (
    'SB1','SBZ','SB5','SA2','SB9','ZFM','ZSF',
    'ENTRADA_NF','PEDIDO_COMPRA','NF_FISCAL','NF_LEGAL','NF_NATIVA',
    'FECHAMENTO_ESTOQUE','MAPA_OPERACOES','FATOS_INSIGHTS'
  ));

DO $$
DECLARE
  constraint_name text;
BEGIN
  IF to_regclass('public.portal_onedrive_reference_state') IS NULL THEN
    CREATE TABLE public.portal_onedrive_reference_state (
      kind text PRIMARY KEY,
      item_id text NOT NULL,
      file_name text NOT NULL,
      file_hash text NOT NULL,
      modified_at timestamptz NOT NULL,
      row_count integer NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  ELSE
    FOR constraint_name IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.portal_onedrive_reference_state'::regclass
        AND contype = 'c'
    LOOP
      EXECUTE format(
        'ALTER TABLE public.portal_onedrive_reference_state DROP CONSTRAINT %I',
        constraint_name
      );
    END LOOP;
  END IF;
END $$;

ALTER TABLE public.portal_onedrive_reference_state
  ADD CONSTRAINT portal_onedrive_reference_state_kind_check
  CHECK (kind IN ('SB1','SBZ','SB9','ZFM','ZSF'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.portal_onedrive_reference_state TO portal_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app_homolog') THEN
    GRANT SELECT, INSERT, UPDATE ON public.portal_onedrive_reference_state TO portal_app_homolog;
  END IF;
END $$;

COMMIT;
