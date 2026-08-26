create extension if not exists pgcrypto;

create table if not exists public.org_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit_id uuid references public.org_units(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text unique,
  full_name text not null,
  email text unique,
  unit_id uuid references public.org_units(id) on delete set null,
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_code text unique,
  legal_name text not null,
  trade_name text,
  document_number text unique,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique,
  name text not null,
  product_type text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_nodes (
  id uuid primary key default gen_random_uuid(),
  node_key text not null unique,
  label text not null,
  parent_id uuid references public.application_nodes(id) on delete cascade,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  email text not null unique,
  display_name text,
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive')),
  is_development_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_access_requests (
  id uuid primary key default gen_random_uuid(),
  requested_email text not null,
  employee_id uuid references public.employees(id) on delete set null,
  requested_by_user_id uuid references public.portal_users(id) on delete set null,
  reviewed_by_user_id uuid references public.portal_users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profile_assignments (
  user_id uuid not null references public.portal_users(id) on delete cascade,
  profile_id uuid not null references public.access_profiles(id) on delete cascade,
  assigned_by_user_id uuid references public.portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, profile_id)
);

create table if not exists public.profile_node_permissions (
  profile_id uuid not null references public.access_profiles(id) on delete cascade,
  node_id uuid not null references public.application_nodes(id) on delete cascade,
  permission text not null check (permission in ('view', 'manage', 'approve')),
  created_at timestamptz not null default now(),
  primary key (profile_id, node_id, permission)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.portal_users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists employees_unit_id_idx on public.employees(unit_id);
create index if not exists employees_cost_center_id_idx on public.employees(cost_center_id);
create index if not exists application_nodes_parent_id_idx on public.application_nodes(parent_id);
create index if not exists portal_users_auth_user_id_idx on public.portal_users(auth_user_id);
create index if not exists user_access_requests_status_idx on public.user_access_requests(status);
create index if not exists audit_events_entity_idx on public.audit_events(entity_type, entity_id);

insert into public.application_nodes (node_key, label, sort_order)
values
  ('administracao', 'Administração', 10),
  ('cadastros', 'Cadastros', 20),
  ('suprimentos-estoques', 'Suprimentos e estoques', 30),
  ('recebimentos', 'Recebimentos', 40),
  ('consumo-entregas', 'Consumo e entregas', 50),
  ('ativos-manutencao', 'Ativos e manutenção', 60)
on conflict (node_key) do update set label = excluded.label, sort_order = excluded.sort_order, updated_at = now();

insert into public.application_nodes (node_key, label, parent_id, sort_order)
select child.node_key, child.label, parent.id, child.sort_order
from (
  values
    ('usuarios-solicitacoes', 'Usuários e solicitações', 'administracao', 10),
    ('perfis-acesso', 'Perfis de acesso', 'administracao', 20),
    ('funcionarios', 'Funcionários', 'cadastros', 10),
    ('fornecedores', 'Fornecedores', 'cadastros', 20),
    ('produtos', 'Produtos', 'cadastros', 30),
    ('compras-protheus', 'Compras e análise Protheus', 'suprimentos-estoques', 10),
    ('consumo-giro-industria', 'Consumo, giro e excedente da indústria', 'suprimentos-estoques', 20),
    ('estoque-autopecas', 'Evolução de estoque de autopeças', 'suprimentos-estoques', 30),
    ('custos-autopecas', 'Evolução de custos de autopeças', 'suprimentos-estoques', 40),
    ('custos-industria', 'Evolução de custos da indústria', 'suprimentos-estoques', 50),
    ('ranking-fornecedores', 'Ranking de fornecedores', 'suprimentos-estoques', 60),
    ('chaves-nf', 'Leitura de chave de acesso de NF', 'recebimentos', 10),
    ('consumiveis-epis-uniformes', 'Consumíveis, EPIs e uniformes', 'consumo-entregas', 10),
    ('empilhadeiras', 'Empilhadeiras', 'ativos-manutencao', 10),
    ('equipamentos-industria', 'Equipamentos da indústria', 'ativos-manutencao', 20),
    ('ferramentas', 'Ferramentas de oficinas e indústria', 'ativos-manutencao', 30)
) as child(node_key, label, parent_key, sort_order)
join public.application_nodes parent on parent.node_key = child.parent_key
on conflict (node_key) do update set label = excluded.label, parent_id = excluded.parent_id, sort_order = excluded.sort_order, updated_at = now();

insert into public.access_profiles (profile_key, name, description)
values
  ('development-admin', 'Administrador técnico', 'Configura integrações e fundações do portal.'),
  ('operations-admin', 'Administrador operacional', 'Administra cadastros, usuários e permissões operacionais.'),
  ('manager', 'Gestor aprovador', 'Aprova solicitações e gerencia os módulos liberados.'),
  ('operator', 'Usuário operacional', 'Executa as atividades dos módulos liberados.'),
  ('viewer', 'Consulta', 'Visualiza os módulos liberados sem alterações.')
on conflict (profile_key) do update set name = excluded.name, description = excluded.description, updated_at = now();

alter table public.org_units enable row level security;
alter table public.cost_centers enable row level security;
alter table public.employees enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.application_nodes enable row level security;
alter table public.access_profiles enable row level security;
alter table public.portal_users enable row level security;
alter table public.user_access_requests enable row level security;
alter table public.user_profile_assignments enable row level security;
alter table public.profile_node_permissions enable row level security;
alter table public.audit_events enable row level security;
