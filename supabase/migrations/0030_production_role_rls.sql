-- Políticas RLS para o role dedicado da produção.
-- Mantém RLS ativo e replica o acesso operacional previsto para portal_app.
\set ON_ERROR_STOP on

GRANT USAGE ON SCHEMA public TO portal_app_prod;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app_prod;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO portal_app_prod;

DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS portal_app_prod_full_access ON %I.%I', item.schema_name, item.table_name);
    EXECUTE format('CREATE POLICY portal_app_prod_full_access ON %I.%I FOR ALL TO portal_app_prod USING (true) WITH CHECK (true)', item.schema_name, item.table_name);
  END LOOP;
END
$$;
