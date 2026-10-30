BEGIN;

DO $$ BEGIN
  IF current_database() <> 'portal_operacoes' THEN
    RAISE EXCEPTION 'Migração autorizada somente para portal_operacoes (Homologação)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.portal_onedrive_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES public.portal_users(id),
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  current_step text,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz
);

CREATE INDEX IF NOT EXISTS portal_onedrive_sync_jobs_pending_idx
  ON public.portal_onedrive_sync_jobs (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS portal_onedrive_sync_jobs_active_idx
  ON public.portal_onedrive_sync_jobs (status, created_at);

DO $$ BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('portal_app', 'portal_app_homolog') LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.portal_onedrive_sync_jobs TO %I', r);
  END LOOP;
END $$;

COMMIT;
