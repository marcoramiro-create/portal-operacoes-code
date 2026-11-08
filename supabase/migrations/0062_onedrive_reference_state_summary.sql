-- ============================================================
-- 0062: amplia o CHECK de portal_onedrive_reference_state.kind
-- para aceitar os estados da REDUÇÃO Protheus (SUMMARY:<PRODUTO>)
-- e o kind 'SB9' gravado pelo sync da SB9 (oneDriveCostSync.ts)
-- ============================================================
-- A varredura automática (scripts/summarizeAll.ts) grava o estado
-- do último original processado por tabela com kind =
-- 'SUMMARY:<PRODUTO>' (ex.: 'SUMMARY:SB9'). O sync da SB9 grava
-- kind='SB9'. O constraint anterior (0053) aceitava apenas
-- SB1/SBZ/ZFM/ZSF.
-- Padrão da 0053: dropa constraints de kind que mencionam SB1
-- e recria com a lista ampliada. Idempotente.
-- ============================================================
BEGIN;

DO $$
DECLARE
  constraint_name text;
BEGIN
  IF current_database() <> 'portal_operacoes' THEN
    RAISE EXCEPTION 'Migração autorizada somente para portal_operacoes (Homologação)';
  END IF;

  IF to_regclass('public.portal_onedrive_reference_state') IS NULL THEN
    RAISE EXCEPTION 'Tabela portal_onedrive_reference_state não existe ( rode 0048/0053 antes).';
  END IF;

  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.portal_onedrive_reference_state'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kind%'
      AND pg_get_constraintdef(oid) ILIKE '%SB1%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.portal_onedrive_reference_state DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.portal_onedrive_reference_state'::regclass
      AND conname = 'portal_onedrive_reference_state_kind_check'
  ) THEN
    ALTER TABLE public.portal_onedrive_reference_state
      ADD CONSTRAINT portal_onedrive_reference_state_kind_check
      CHECK (kind IN ('SB1', 'SBZ', 'ZFM', 'ZSF', 'SB9')
             OR kind LIKE 'SUMMARY:%');
  END IF;
END $$;

COMMIT;
