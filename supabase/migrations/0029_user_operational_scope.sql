-- Fase 1 — escopo operacional de usuários.
--
-- Regras:
-- 1) portal_users continua sendo a identidade do portal; não criar usuário paralelo.
-- 2) employee_id continua sendo o vínculo principal com o cadastro de funcionários.
-- 3) Um usuário possui uma filial padrão e pode possuir várias filiais autorizadas.
-- 4) Privilégios operacionais são individuais e complementam a matriz de aplicações.
-- 5) A filial destino de um redespacho poderá consultar a NF quando estiver autorizada
--    para o usuário/equipe responsável pela confirmação da segunda leitura.

create table if not exists public.portal_user_branch_access (
  user_id uuid not null references public.portal_users(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  is_default boolean not null default false,
  active boolean not null default true,
  assigned_by_user_id uuid references public.portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, branch_id)
);

create unique index if not exists portal_user_one_default_branch_idx
  on public.portal_user_branch_access(user_id)
  where is_default = true and active = true;

create index if not exists portal_user_branch_access_branch_idx
  on public.portal_user_branch_access(branch_id, user_id)
  where active = true;

create table if not exists public.portal_user_operational_privileges (
  user_id uuid not null references public.portal_users(id) on delete cascade,
  privilege_key text not null,
  allowed boolean not null default true,
  assigned_by_user_id uuid references public.portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, privilege_key),
  check (length(trim(privilege_key)) between 3 and 100)
);

create index if not exists portal_user_operational_privileges_key_idx
  on public.portal_user_operational_privileges(privilege_key, user_id)
  where allowed = true;

-- Carga inicial não destrutiva: usuários já vinculados a funcionários recebem
-- a filial do funcionário como filial padrão. Não altera acessos já definidos.
insert into public.portal_user_branch_access (user_id, branch_id, is_default, assigned_by_user_id)
select portal_user.id, employee.branch_id, true, null
from public.portal_users portal_user
join public.employees employee on employee.id = portal_user.employee_id
where employee.branch_id is not null
  and not exists (
    select 1
    from public.portal_user_branch_access existing
    where existing.user_id = portal_user.id
  )
on conflict (user_id, branch_id) do nothing;

alter table public.portal_user_branch_access enable row level security;
alter table public.portal_user_operational_privileges enable row level security;

grant select, insert, update, delete on public.portal_user_branch_access to portal_app;
grant select, insert, update, delete on public.portal_user_operational_privileges to portal_app;

drop policy if exists portal_user_branch_access_portal_app on public.portal_user_branch_access;
create policy portal_user_branch_access_portal_app
  on public.portal_user_branch_access
  for all to portal_app using (true) with check (true);

drop policy if exists portal_user_operational_privileges_portal_app on public.portal_user_operational_privileges;
create policy portal_user_operational_privileges_portal_app
  on public.portal_user_operational_privileges
  for all to portal_app using (true) with check (true);
