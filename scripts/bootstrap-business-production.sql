-- Bootstrap do banco PostgreSQL de negócio da produção.
--
-- Executar na VM Oracle como ubuntu:
--   sudo -u postgres psql \
--     -v business_db_password="$(openssl rand -hex 32)" \
--     -f /tmp/bootstrap-business-production.sql
--
-- O banco é criado vazio. Não copia dados da homologação.
-- O role é exclusivo da produção: portal_business_prod.

\set ON_ERROR_STOP on
\if :{?business_db_password}
\else
  \echo 'ERRO: informe -v business_db_password="..." ao executar este arquivo.'
  \quit 2
\endif

select format('create role portal_business_prod login password %L', :'business_db_password')
where not exists (select 1 from pg_roles where rolname = 'portal_business_prod')\gexec

select format('alter role portal_business_prod with login password %L', :'business_db_password')\gexec

select format('create database portal_negocio_prod owner portal_business_prod template template0')
where not exists (select 1 from pg_database where datname = 'portal_negocio_prod')\gexec

revoke connect on database portal_negocio_prod from public;
grant connect on database portal_negocio_prod to portal_business_prod;

\connect portal_negocio_prod

create table if not exists public.business_schema_info (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

\ir /tmp/drizzle-business-baseline.sql

grant usage on schema public to portal_business_prod;
alter default privileges in schema public grant select, insert, update, delete on tables to portal_business_prod;
alter default privileges in schema public grant usage, select, update on sequences to portal_business_prod;

insert into public.business_schema_info (key, value)
values ('environment', 'production')
on conflict (key) do update set value = excluded.value, updated_at = now();
insert into public.business_schema_info (key, value)
values ('schema', 'drizzle-business-baseline')
on conflict (key) do update set value = excluded.value, updated_at = now();

\echo 'BANCO_NEGOCIO_PRODUCAO_CONFIGURADO: portal_negocio_prod'
