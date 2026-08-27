create table if not exists public.employee_item_custodies (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  delivered_operation_line_id uuid not null references public.stock_operation_lines(id) on delete restrict,
  delivered_by_user_id uuid references public.portal_users(id) on delete set null,
  delivered_at timestamptz not null default now(),
  delivered_quantity numeric(14,3) not null check (delivered_quantity > 0),
  returned_quantity numeric(14,3) not null default 0 check (returned_quantity >= 0 and returned_quantity <= delivered_quantity),
  size_code text not null default '',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_item_custody_returns (
  id uuid primary key default gen_random_uuid(),
  custody_id uuid not null references public.employee_item_custodies(id) on delete restrict,
  return_operation_line_id uuid not null references public.stock_operation_lines(id) on delete restrict,
  received_by_user_id uuid references public.portal_users(id) on delete set null,
  returned_at timestamptz not null default now(),
  returned_quantity numeric(14,3) not null check (returned_quantity > 0),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists employee_item_custodies_employee_idx on public.employee_item_custodies(employee_id, delivered_at desc);
create index if not exists employee_item_custodies_product_idx on public.employee_item_custodies(product_id, delivered_at desc);
create index if not exists employee_item_returns_custody_idx on public.employee_item_custody_returns(custody_id, returned_at desc);

alter table public.employee_item_custodies enable row level security;
alter table public.employee_item_custody_returns enable row level security;

insert into public.application_nodes (node_key, label, parent_id, sort_order)
select 'almoxarifado-devolucoes', 'Devoluções de itens', parent.id, 50
from public.application_nodes parent
where parent.node_key = 'almoxarifado'
on conflict (node_key) do update set label = excluded.label, parent_id = excluded.parent_id, sort_order = excluded.sort_order, updated_at = now();

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, permission.permission
from public.access_profiles profile
join public.application_nodes node on node.node_key = 'almoxarifado-devolucoes'
cross join (values ('view'::text), ('manage'::text), ('approve'::text)) as permission(permission)
where profile.profile_key in ('development-admin', 'operations-admin')
on conflict do nothing;

insert into public.profile_node_permissions (profile_id, node_id, permission)
select profile.id, node.id, 'view'
from public.access_profiles profile
join public.application_nodes node on node.node_key = 'almoxarifado-devolucoes'
where profile.profile_key in ('manager', 'viewer')
on conflict do nothing;
