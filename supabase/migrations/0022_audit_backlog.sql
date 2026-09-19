-- KPI e backlog da auditoria operacional.
-- REGRA DE NEGÓCIO: findings são derivados da auditoria; dados brutos nunca são alterados.
-- REGRA DE NEGÓCIO: sincronização nunca apaga finding; last_seen_at registra a última ocorrência.
-- REGRA DE NEGÓCIO: tratativas são dados de gestão separados do finding calculado.
create table if not exists public.audit_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  triggered_by uuid references public.portal_users(id) on delete set null,
  metrics jsonb not null default '{}'::jsonb,
  exception_count integer not null default 0,
  duplicate_count integer not null default 0,
  findings_new integer not null default 0,
  findings_updated integer not null default 0
);

create table if not exists public.audit_findings (
  id uuid primary key default gen_random_uuid(),
  finding_key text not null unique,
  category text not null check (category in ('EXCECAO','DUPLICIDADE')),
  kind text not null,
  scope text,
  source text not null,
  source_key text not null,
  detail text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrences integer not null default 1,
  last_run_id uuid references public.audit_runs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists audit_findings_source_idx on public.audit_findings(source, category, kind);
create index if not exists audit_findings_last_seen_idx on public.audit_findings(last_seen_at);

create table if not exists public.audit_finding_treatments (
  finding_id uuid primary key references public.audit_findings(id) on delete cascade,
  status text not null default 'aberto' check (status in ('aberto','em_tratativa','resolvido','ignorado')),
  priority text not null default 'media' check (priority in ('alta','media','baixa')),
  responsible_name text not null default '',
  responsible_employee_id uuid references public.employees(id) on delete set null,
  due_date date,
  note text not null default '',
  resolved_at timestamptz,
  resolved_by uuid references public.portal_users(id) on delete set null,
  updated_by uuid references public.portal_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_treatment_events (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.audit_findings(id) on delete cascade,
  actor_user_id uuid references public.portal_users(id) on delete set null,
  changed_at timestamptz not null default now(),
  changes jsonb not null default '{}'::jsonb
);
create index if not exists audit_treatment_events_finding_idx on public.audit_treatment_events(finding_id, changed_at);
