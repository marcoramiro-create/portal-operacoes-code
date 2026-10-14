create table if not exists public.portal_onedrive_connections (
  user_id uuid primary key references public.portal_users(id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.portal_onedrive_connections enable row level security;
drop policy if exists portal_onedrive_connections_portal_app on public.portal_onedrive_connections;
create policy portal_onedrive_connections_portal_app on public.portal_onedrive_connections for all to portal_app using (true) with check (true);
grant select, insert, update, delete on public.portal_onedrive_connections to portal_app;
