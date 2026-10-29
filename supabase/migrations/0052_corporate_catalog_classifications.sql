-- Camada derivada unificada para ZFM e ZSF.
-- Não apagar nem substituir familyReferences/subfamilyReferences nesta etapa.
-- Dados brutos continuam em operational_source_rows.

create table if not exists public.corporate_catalog_classifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('FAMILIA', 'SUBFAMILIA')),
  code text not null,
  description text not null,
  source_batch_id uuid references public.operational_import_batches(id) on delete set null,
  source_system text not null check (source_system in ('ZFM', 'ZSF')),
  active boolean not null default true,
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  unique (kind, code)
);

create table if not exists public.product_classification_links (
  product_id uuid not null references public.products(id) on delete restrict,
  classification_id uuid not null references public.corporate_catalog_classifications(id) on delete restrict,
  classification_kind text not null check (classification_kind in ('FAMILIA', 'SUBFAMILIA')),
  source_batch_id uuid references public.operational_import_batches(id) on delete set null,
  valid_from date not null default current_date,
  valid_to date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  primary key (product_id, classification_id, valid_from)
);

-- A igualdade entre classification_kind e o tipo do registro referenciado é
-- validada pelo serviço de materialização; PostgreSQL não aceita subconsultas
-- dentro de CHECK constraints.

create unique index if not exists product_classification_links_one_active_kind_idx
  on public.product_classification_links(product_id, classification_kind)
  where active;

create index if not exists corporate_catalog_classifications_active_idx
  on public.corporate_catalog_classifications(kind, active, code);

create index if not exists product_classification_links_lookup_idx
  on public.product_classification_links(classification_kind, classification_id, active);

alter table public.corporate_catalog_classifications enable row level security;
alter table public.product_classification_links enable row level security;

grant select, insert, update, delete on public.corporate_catalog_classifications to portal_app;
grant select, insert, update, delete on public.product_classification_links to portal_app;

drop policy if exists corporate_catalog_classifications_portal_app on public.corporate_catalog_classifications;
create policy corporate_catalog_classifications_portal_app
  on public.corporate_catalog_classifications for all to portal_app
  using (true) with check (true);

drop policy if exists product_classification_links_portal_app on public.product_classification_links;
create policy product_classification_links_portal_app
  on public.product_classification_links for all to portal_app
  using (true) with check (true);
