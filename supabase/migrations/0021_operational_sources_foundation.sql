-- Fundação de dados operacionais do Portal de Operações
-- Preserva as linhas brutas das fontes RM BIS/Protheus/NF Legal antes dos cruzamentos.

create table if not exists public.operational_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in ('SB1','SBZ','SB5','SA2','ENTRADA_NF','PEDIDO_COMPRA','NF_FISCAL','NF_LEGAL','NF_NATIVA','FECHAMENTO_ESTOQUE','MAPA_OPERACOES','FATOS_INSIGHTS')),
  file_name text not null,
  file_hash text not null,
  operation text check (operation is null or operation in ('AUTOPECAS','SERVICOS','INDUSTRIA','IMPLEMENTOS')),
  status text not null default 'received' check (status in ('received','validated','processed','failed','archived')),
  row_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique(source_kind, file_hash)
);

create table if not exists public.operational_source_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.operational_import_batches(id) on delete cascade,
  source_row_number integer not null,
  operation text check (operation is null or operation in ('AUTOPECAS','SERVICOS','INDUSTRIA','IMPLEMENTOS')),
  company_code text,
  branch_code text,
  warehouse_code text,
  product_code text,
  aggregate_product_code text,
  supplier_code text,
  supplier_store text,
  purchase_order_number text,
  purchase_order_item text,
  invoice_number text,
  invoice_series text,
  access_key text,
  event_date date,
  quantity numeric(20,6),
  unit_value numeric(20,6),
  total_value numeric(20,6),
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  issue_messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(batch_id, source_row_number)
);

create index if not exists operational_source_rows_product_idx on public.operational_source_rows(product_code, branch_code);
create index if not exists operational_source_rows_order_idx on public.operational_source_rows(branch_code, purchase_order_number, purchase_order_item);
create index if not exists operational_source_rows_invoice_idx on public.operational_source_rows(branch_code, invoice_number, invoice_series, supplier_code);
create index if not exists operational_source_rows_access_key_idx on public.operational_source_rows(access_key);

create table if not exists public.operation_warehouse_map (
  id uuid primary key default gen_random_uuid(),
  warehouse_code text not null,
  company_code text,
  branch_code text,
  uf text,
  department text not null,
  operation text not null check (operation in ('AUTOPECAS','SERVICOS','INDUSTRIA','IMPLEMENTOS')),
  active boolean not null default true,
  source_batch_id uuid references public.operational_import_batches(id) on delete set null,
  unique(warehouse_code, company_code, branch_code, department)
);

create table if not exists public.operation_calendars (
  id uuid primary key default gen_random_uuid(),
  branch_code text not null,
  name text not null,
  year integer not null,
  active boolean not null default true,
  unique(branch_code, year)
);

create table if not exists public.operation_calendar_days (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.operation_calendars(id) on delete cascade,
  calendar_date date not null,
  is_business_day boolean not null default true,
  description text,
  unique(calendar_id, calendar_date)
);

alter table public.operational_import_batches enable row level security;
alter table public.operational_source_rows enable row level security;
alter table public.operation_warehouse_map enable row level security;
alter table public.operation_calendars enable row level security;
alter table public.operation_calendar_days enable row level security;
