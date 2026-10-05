-- Fundação da autenticação própria do Portal de Operações.
-- A migração cria a base de credenciais e sessões sem alterar ainda o login atual.
-- REGRA: nunca armazenar senha em texto; password_hash deve ser gerado por Argon2id/bcrypt no servidor.
-- REGRA: tokens de sessão e recuperação são armazenados somente como hash.
-- REGRA: o vínculo com portal_users reaproveita o cadastro existente; não criar usuário paralelo.

alter table public.portal_users
  add column if not exists password_hash text;
alter table public.portal_users
  add column if not exists password_changed_at timestamptz;
alter table public.portal_users
  add column if not exists last_login_at timestamptz;
alter table public.portal_users
  add column if not exists failed_login_count integer not null default 0;
alter table public.portal_users
  add column if not exists locked_until timestamptz;

create table if not exists public.portal_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.portal_users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  check (expires_at > created_at)
);
create index if not exists portal_sessions_user_idx on public.portal_sessions(user_id, expires_at);
create index if not exists portal_sessions_active_idx on public.portal_sessions(token_hash, expires_at) where revoked_at is null;

create table if not exists public.portal_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.portal_users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_ip inet,
  check (expires_at > created_at)
);
create index if not exists portal_password_reset_tokens_user_idx on public.portal_password_reset_tokens(user_id, expires_at);
create unique index if not exists portal_password_reset_tokens_active_user_idx
  on public.portal_password_reset_tokens(user_id) where used_at is null;

create table if not exists public.portal_auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.portal_users(id) on delete set null,
  event_type text not null check (event_type in ('login_success','login_failure','logout','session_revoked','password_reset_requested','password_reset_completed','account_locked')),
  occurred_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  details jsonb not null default '{}'::jsonb
);
create index if not exists portal_auth_events_user_idx on public.portal_auth_events(user_id, occurred_at desc);
create index if not exists portal_auth_events_type_idx on public.portal_auth_events(event_type, occurred_at desc);

alter table public.portal_sessions enable row level security;
alter table public.portal_password_reset_tokens enable row level security;
alter table public.portal_auth_events enable row level security;

grant select, insert, update, delete on public.portal_sessions to portal_app;
grant select, insert, update, delete on public.portal_password_reset_tokens to portal_app;
grant select, insert on public.portal_auth_events to portal_app;
grant update on public.portal_users to portal_app;

drop policy if exists portal_sessions_portal_app on public.portal_sessions;
create policy portal_sessions_portal_app on public.portal_sessions for all to portal_app using (true) with check (true);
drop policy if exists portal_password_reset_tokens_portal_app on public.portal_password_reset_tokens;
create policy portal_password_reset_tokens_portal_app on public.portal_password_reset_tokens for all to portal_app using (true) with check (true);
drop policy if exists portal_auth_events_portal_app on public.portal_auth_events;
create policy portal_auth_events_portal_app on public.portal_auth_events for all to portal_app using (true) with check (true);
