-- Cadastro corporativo único derivado da SB1 e curvas por operação/filial.
-- REGRA: products é a entidade corporativa única; não criar cadastros paralelos por aplicação.
-- REGRA: o dado bruto permanece em operational_source_rows; estas tabelas são camadas derivadas.
-- REGRA: um agregado pode reunir N produtos; agregado não é tratado como produto único.

create table if not exists public.product_aggregates (
  id uuid primary key default gen_random_uuid(),
  aggregate_code text not null unique,
  name text,
  source_batch_id uuid references public.operational_import_batches(id) on delete set null,
  source_system text not null default 'SB1',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_aggregate_members (
  aggregate_id uuid not null references public.product_aggregates(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  source_batch_id uuid references public.operational_import_batches(id) on delete set null,
  valid_from date not null default current_date,
  valid_to date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (aggregate_id, product_id),
  check (valid_to is null or valid_to >= valid_from)
);
create unique index if not exists product_aggregate_members_active_product_idx
  on public.product_aggregate_members(product_id) where active;

alter table public.products add column if not exists source_batch_id uuid references public.operational_import_batches(id) on delete set null;
alter table public.products add column if not exists source_system text not null default 'SB1';
alter table public.products add column if not exists source_product_code text;
alter table public.products add column if not exists active_from date not null default current_date;
alter table public.products add column if not exists active_to date;
create unique index if not exists products_source_identity_idx on public.products(source_system, source_product_code) where source_product_code is not null;

create table if not exists public.sbz_product_curves (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  branch_code text not null,
  operation text not null check (operation in ('AUTOPECAS','SERVICOS','INDUSTRIA','IMPLEMENTOS')),
  curve_code text not null check (curve_code in ('A','B','C','D','E')),
  reference_period date not null,
  source text not null,
  calculation_version text not null,
  calculated_at timestamptz not null default now(),
  is_current boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  unique(product_id, branch_code, operation, reference_period, calculation_version)
);
create index if not exists sbz_product_curves_current_idx
  on public.sbz_product_curves(operation, branch_code, product_id) where is_current;
create index if not exists sbz_product_curves_period_idx
  on public.sbz_product_curves(reference_period, operation, branch_code);

alter table public.product_aggregates enable row level security;
alter table public.product_aggregate_members enable row level security;
alter table public.sbz_product_curves enable row level security;
alter table public.products enable row level security;
alter table public.product_types enable row level security;

grant usage on schema public to portal_app;
grant select, insert, update on public.product_aggregates to portal_app;
grant select, insert, update on public.product_aggregate_members to portal_app;
grant select, insert, update on public.sbz_product_curves to portal_app;
grant select, insert, update on public.products to portal_app;
grant select, insert, update on public.product_types to portal_app;

drop policy if exists products_portal_app on public.products;
create policy products_portal_app on public.products for all to portal_app using (true) with check (true);
drop policy if exists product_types_portal_app on public.product_types;
create policy product_types_portal_app on public.product_types for all to portal_app using (true) with check (true);
drop policy if exists product_aggregates_portal_app on public.product_aggregates;
create policy product_aggregates_portal_app on public.product_aggregates for all to portal_app using (true) with check (true);
drop policy if exists product_aggregate_members_portal_app on public.product_aggregate_members;
create policy product_aggregate_members_portal_app on public.product_aggregate_members for all to portal_app using (true) with check (true);
drop policy if exists sbz_product_curves_portal_app on public.sbz_product_curves;
create policy sbz_product_curves_portal_app on public.sbz_product_curves for all to portal_app using (true) with check (true);
