create table if not exists public.product_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  stock_controlled boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  legal_name text not null,
  trade_name text,
  tax_id text unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  tax_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, code)
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(branch_id, code)
);

create table if not exists public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(warehouse_id, code)
);

alter table public.products add column if not exists product_type_id uuid references public.product_types(id) on delete set null;
alter table public.products add column if not exists unit_of_measure text not null default 'UN';
alter table public.products add column if not exists requires_size boolean not null default false;
alter table public.products add column if not exists requires_lot boolean not null default false;
alter table public.products add column if not exists requires_expiration boolean not null default false;
alter table public.products add column if not exists requires_ca boolean not null default false;

alter table public.employees add column if not exists company_id uuid references public.companies(id) on delete set null;
alter table public.employees add column if not exists branch_id uuid references public.branches(id) on delete set null;
alter table public.employees add column if not exists department text;
alter table public.employees add column if not exists job_title text;
alter table public.employees add column if not exists manager_employee_id uuid references public.employees(id) on delete set null;
alter table public.employees add column if not exists admission_date date;
alter table public.employees add column if not exists is_inventory_requester boolean not null default true;

alter table public.portal_users add column if not exists can_fulfill_inventory_requests boolean not null default false;

create table if not exists public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  lot_code text,
  ca_number text,
  manufactured_at date,
  expires_at date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_policies (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  minimum_quantity numeric(14,3) not null default 0 check (minimum_quantity >= 0),
  maximum_quantity numeric(14,3) check (maximum_quantity is null or maximum_quantity >= minimum_quantity),
  safety_days integer not null default 30 check (safety_days >= 0),
  coverage_days integer not null default 60 check (coverage_days >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(warehouse_id, product_id)
);

create table if not exists public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  stock_location_id uuid not null references public.stock_locations(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  stock_lot_id uuid references public.stock_lots(id) on delete restrict,
  size_code text not null default '',
  on_hand_quantity numeric(14,3) not null default 0,
  reserved_quantity numeric(14,3) not null default 0 check (reserved_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct(stock_location_id, product_id, stock_lot_id, size_code)
);

create table if not exists public.stock_operations (
  id uuid primary key default gen_random_uuid(),
  operation_number bigint generated by default as identity unique,
  operation_type text not null check (operation_type in ('requisition', 'purchase_receipt', 'inventory_initial', 'inventory_adjustment', 'transfer', 'fulfillment', 'return')),
  status text not null check (status in ('draft', 'open', 'partial', 'completed', 'cancelled', 'posted')),
  requested_by_user_id uuid references public.portal_users(id) on delete set null,
  requester_employee_id uuid references public.employees(id) on delete set null,
  handled_by_user_id uuid references public.portal_users(id) on delete set null,
  source_warehouse_id uuid references public.warehouses(id) on delete restrict,
  source_stock_location_id uuid references public.stock_locations(id) on delete restrict,
  destination_warehouse_id uuid references public.warehouses(id) on delete restrict,
  destination_stock_location_id uuid references public.stock_locations(id) on delete restrict,
  nf_receipt_id uuid references public.nf_receipts(id) on delete set null,
  related_operation_id uuid references public.stock_operations(id) on delete set null,
  scheduled_at timestamptz,
  occurred_at timestamptz,
  reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_operation_lines (
  id uuid primary key default gen_random_uuid(),
  stock_operation_id uuid not null references public.stock_operations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  stock_lot_id uuid references public.stock_lots(id) on delete restrict,
  size_code text not null default '',
  requested_quantity numeric(14,3) not null default 0 check (requested_quantity >= 0),
  fulfilled_quantity numeric(14,3) not null default 0 check (fulfilled_quantity >= 0),
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  stock_operation_line_id uuid not null references public.stock_operation_lines(id) on delete restrict,
  stock_location_id uuid not null references public.stock_locations(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  stock_lot_id uuid references public.stock_lots(id) on delete restrict,
  size_code text not null default '',
  movement_type text not null check (movement_type in ('in', 'out', 'reserve', 'release')),
  quantity numeric(14,3) not null check (quantity > 0),
  created_by_user_id uuid references public.portal_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.tool_instances (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  instance_code text not null unique,
  current_stock_location_id uuid references public.stock_locations(id) on delete set null,
  current_employee_id uuid references public.employees(id) on delete set null,
  status text not null default 'available' check (status in ('available', 'assigned', 'maintenance', 'damaged', 'lost', 'retired')),
  condition_state text not null default 'good' check (condition_state in ('new', 'good', 'fair', 'damaged', 'maintenance', 'lost', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tool_custodies (
  id uuid primary key default gen_random_uuid(),
  tool_instance_id uuid not null references public.tool_instances(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  delivered_operation_line_id uuid references public.stock_operation_lines(id) on delete set null,
  delivered_by_user_id uuid references public.portal_users(id) on delete set null,
  delivered_at timestamptz not null default now(),
  delivered_condition text not null default 'good',
  returned_operation_line_id uuid references public.stock_operation_lines(id) on delete set null,
  received_by_user_id uuid references public.portal_users(id) on delete set null,
  returned_at timestamptz,
  returned_condition text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists branches_company_id_idx on public.branches(company_id);
create index if not exists warehouses_branch_id_idx on public.warehouses(branch_id);
create index if not exists stock_locations_warehouse_id_idx on public.stock_locations(warehouse_id);
create index if not exists stock_balances_product_id_idx on public.stock_balances(product_id);
create index if not exists stock_operations_type_status_idx on public.stock_operations(operation_type, status, created_at desc);
create index if not exists stock_operations_requester_idx on public.stock_operations(requester_employee_id, created_at desc);
create index if not exists stock_movements_location_product_idx on public.stock_movements(stock_location_id, product_id, created_at desc);
create index if not exists tool_custodies_employee_idx on public.tool_custodies(employee_id, returned_at);

alter table public.product_types enable row level security;
alter table public.companies enable row level security;
alter table public.branches enable row level security;
alter table public.warehouses enable row level security;
alter table public.stock_locations enable row level security;
alter table public.stock_lots enable row level security;
alter table public.stock_policies enable row level security;
alter table public.stock_balances enable row level security;
alter table public.stock_operations enable row level security;
alter table public.stock_operation_lines enable row level security;
alter table public.stock_movements enable row level security;
alter table public.tool_instances enable row level security;
alter table public.tool_custodies enable row level security;

insert into public.application_nodes (node_key, label, parent_id, sort_order)
select child.node_key, child.label, parent.id, child.sort_order
from (
  values
    ('almoxarifado', 'Almoxarifado', 'consumo-entregas', 5),
    ('almoxarifado-requisicoes', 'Requisições', 'almoxarifado', 10),
    ('almoxarifado-atendimentos', 'Atendimentos', 'almoxarifado', 20),
    ('almoxarifado-movimentacoes', 'Entradas, transferências e inventário', 'almoxarifado', 30),
    ('almoxarifado-estoque', 'Posição de estoque', 'almoxarifado', 40)
) as child(node_key, label, parent_key, sort_order)
join public.application_nodes parent on parent.node_key = child.parent_key
on conflict (node_key) do update set label = excluded.label, parent_id = excluded.parent_id, sort_order = excluded.sort_order, updated_at = now();

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, permission.permission
from public.access_profiles profile
cross join public.application_nodes node
cross join (values ('view'::text), ('manage'::text), ('approve'::text)) as permission(permission)
where profile.profile_key in ('development-admin', 'operations-admin')
  and node.node_key in ('almoxarifado', 'almoxarifado-requisicoes', 'almoxarifado-atendimentos', 'almoxarifado-movimentacoes', 'almoxarifado-estoque')
on conflict do nothing;

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, 'view'
from public.access_profiles profile
cross join public.application_nodes node
where profile.profile_key in ('manager', 'viewer')
  and node.node_key in ('almoxarifado', 'almoxarifado-requisicoes', 'almoxarifado-atendimentos', 'almoxarifado-movimentacoes', 'almoxarifado-estoque')
on conflict do nothing;
