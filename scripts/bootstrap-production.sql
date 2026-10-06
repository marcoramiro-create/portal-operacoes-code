-- Bootstrap da base de produção do Portal de Operações.
--
-- EXECUÇÃO NA VM ORACLE, como ubuntu:
--   sudo -u postgres psql \
--     -v portal_db_password="$(openssl rand -hex 32)" \
--     -f /home/ubuntu/portal-operacoes-code/scripts/bootstrap-production.sql
--
-- IMPORTANTE:
-- - O script cria uma base VAZIA; não copia dados da homologação.
-- - A senha é recebida somente como variável do psql e não é gravada neste arquivo.
-- - As migrações são aplicadas a partir do checkout em /home/ubuntu/portal-operacoes-code.
-- - Execute somente depois de conferir que esse caminho contém as migrações atuais.

\set ON_ERROR_STOP on
\if :{?portal_db_password}
\else
  \echo 'ERRO: informe -v portal_db_password="..." ao executar este arquivo.'
  \quit 2
\endif

-- 1) Usuário técnico da aplicação.
select format('create role portal_app_prod login password %L', :'portal_db_password')
where not exists (select 1 from pg_roles where rolname = 'portal_app_prod')\gexec

-- Também atualiza a senha quando o role já existir, sem exibi-la na saída.
select format('alter role portal_app_prod with login password %L', :'portal_db_password')\gexec

-- 2) Banco isolado, criado sem dados da homologação.
select format('create database portal_operacoes_prod owner portal_app_prod template template0')
where not exists (select 1 from pg_database where datname = 'portal_operacoes_prod')\gexec

revoke connect on database portal_operacoes_prod from public;
grant connect on database portal_operacoes_prod to portal_app_prod;

\connect portal_operacoes_prod

create extension if not exists pgcrypto;

-- Compatibilidade estrutural para a referência histórica de 0001_portal_core.
-- A autenticação atual do portal usa portal_users + portal_sessions próprios;
-- esta tabela não armazena senhas nem é usada pelo login da produção.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key
);

-- 3) Aplicação das migrações versionadas.
-- Cada arquivo é idempotente conforme o padrão atual do projeto.
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0001_portal_core.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0002_initial_access_profiles.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0003_prevent_duplicate_access_requests.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0004_registration_operation_permissions.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0005_registration_profile_navigation.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0006_user_node_permissions.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0007_profile_permission_matrix.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0008_manager_access_approval.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0009_nf_receipts.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0010_inventory_control_foundation.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0011_inventory_application_children.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0012_inventory_tools_node.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0013_inventory_employee_custodies.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0014_inventory_product_categories.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0015_centralize_inventory_catalog.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0016_registration_hierarchy.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0017_supplier_code_store.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0018_cost_center_branch_scope.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0021_operational_sources_foundation.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0022_audit_backlog.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0023_corporate_catalog_and_curves.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0024_portal_auth_foundation.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0025_complete_corporate_catalog.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0026_nf_receipts_reading_point.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0029_user_operational_scope.sql
\ir /home/ubuntu/portal-operacoes-code/supabase/migrations/0030_production_role_rls.sql

-- 0019, 0020 e 0028 alteram inventoryAnalytics, que pertence ao banco
-- operacional de negócio (MySQL/TiDB), não a esta base PostgreSQL do portal.

-- 4) Garantias mínimas para o usuário da aplicação.
grant usage on schema public to portal_app_prod;
alter default privileges in schema public grant select, insert, update, delete on tables to portal_app_prod;
alter default privileges in schema public grant usage, select, update on sequences to portal_app_prod;

-- 5) Registro simples da versão aplicada para conferência operacional.
create table if not exists public.portal_schema_info (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into public.portal_schema_info (key, value)
values ('environment', 'production')
on conflict (key) do update set value = excluded.value, updated_at = now();
insert into public.portal_schema_info (key, value)
values ('bootstrap', '0029_user_operational_scope')
on conflict (key) do update set value = excluded.value, updated_at = now();

\echo 'PRODUCAO_CONFIGURADA: portal_operacoes_prod'
