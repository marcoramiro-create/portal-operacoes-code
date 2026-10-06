create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_positions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employees add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.employees add column if not exists job_position_id uuid references public.job_positions(id) on delete set null;

create index if not exists employees_department_id_idx on public.employees(department_id);
create index if not exists employees_job_position_id_idx on public.employees(job_position_id);

alter table public.departments enable row level security;
alter table public.job_positions enable row level security;

grant usage on schema public to portal_app;
grant select, insert, update on public.departments, public.job_positions to portal_app;
grant select, insert, update on public.companies, public.branches, public.org_units, public.cost_centers, public.employees to portal_app;

drop policy if exists departments_portal_app on public.departments;
create policy departments_portal_app on public.departments for all to portal_app using (true) with check (true);
drop policy if exists job_positions_portal_app on public.job_positions;
create policy job_positions_portal_app on public.job_positions for all to portal_app using (true) with check (true);

-- Compatibilidade: os textos antigos permanecem para histórico; novos cadastros usam as referências.
