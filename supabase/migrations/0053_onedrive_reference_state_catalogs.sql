BEGIN;

DO $$
DECLARE
  constraint_name text;
BEGIN
  IF current_database() <> 'portal_operacoes' THEN
    RAISE EXCEPTION 'Migração autorizada somente para portal_operacoes (Homologação)';
  END IF;

  SELECT conname
    INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.portal_onedrive_reference_state'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%kind%SB1%SBZ%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.portal_onedrive_reference_state DROP CONSTRAINT %I',
      constraint_name
    );
  END IF;
END $$;

ALTER TABLE public.portal_onedrive_reference_state
  ADD CONSTRAINT portal_onedrive_reference_state_kind_check
  CHECK (kind IN ('SB1', 'SBZ', 'ZFM', 'ZSF'));

COMMIT;
