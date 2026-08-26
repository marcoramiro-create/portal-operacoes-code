create table if not exists public.registration_operation_permissions (
  user_id uuid not null references public.portal_users(id) on delete cascade,
  registration_type text not null check (registration_type in ('users', 'employees', 'suppliers', 'products')),
  operation text not null check (operation in ('view', 'create', 'import', 'manage')),
  allowed boolean not null,
  updated_by_user_id uuid references public.portal_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, registration_type, operation)
);

alter table public.registration_operation_permissions enable row level security;
create index if not exists registration_operation_permissions_user_idx on public.registration_operation_permissions(user_id, registration_type);
