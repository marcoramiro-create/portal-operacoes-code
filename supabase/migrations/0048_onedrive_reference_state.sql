BEGIN;
DO $$ BEGIN
  IF current_database() <> 'portal_operacoes' THEN
    RAISE EXCEPTION 'Migração autorizada somente para portal_operacoes (Homologação)';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.portal_onedrive_reference_state (
  kind text PRIMARY KEY CHECK (kind IN ('SB1','SBZ')),
  item_id text NOT NULL,
  file_name text NOT NULL,
  file_hash text NOT NULL,
  modified_at timestamptz NOT NULL,
  row_count integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE r text; BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('portal_app','portal_app_homolog') LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.portal_onedrive_reference_state TO %I', r);
  END LOOP;
END $$;
COMMIT;
