BEGIN;

DO $$
DECLARE
  constraint_name text;
BEGIN
  IF current_database() <> 'portal_operacoes' THEN
    RAISE EXCEPTION 'Migração autorizada somente para portal_operacoes (Homologação)';
  END IF;

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
        AND pg_get_constraintdef(oid) ILIKE '%kind%'
        AND pg_get_constraintdef(oid) ILIKE '%SB1%'
        AND pg_get_constraintdef(oid) ILIKE '%SBZ%'
    LOOP
      EXECUTE format(
        'ALTER TABLE public.portal_onedrive_reference_state DROP CONSTRAINT %I',
        constraint_name
      );
    END LOOP;
  END IF;
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
      CHECK (kind IN ('SB1', 'SBZ', 'ZFM', 'ZSF'));
  END IF;
END $$;

COMMIT;
