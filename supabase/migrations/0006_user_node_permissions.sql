create table if not exists public.user_node_permissions (
  user_id uuid not null references public.portal_users(id) on delete cascade,
  node_id uuid not null references public.application_nodes(id) on delete cascade,
  permission text not null check (permission in ('view', 'manage', 'approve')),
  allowed boolean not null,
  updated_by_user_id uuid references public.portal_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, node_id, permission)
);

alter table public.user_node_permissions enable row level security;
create index if not exists user_node_permissions_user_idx on public.user_node_permissions(user_id, node_id);
