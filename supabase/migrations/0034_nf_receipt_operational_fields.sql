-- Completa o schema operacional de recebimentos sem apagar o histórico.
-- Idempotente para homologação e produção.

create table if not exists public.transportadoras (
  id uuid primary key default gen_random_uuid(),
  code text not null default '',
  name text not null,
  cnpj text,
  city text,
  uf text,
  active boolean not null default true,
  source_file text,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nf_receipts
  add column if not exists reading_point text not null default 'recebimento'
    check (reading_point in ('descarga', 'recebimento', 'conferencia', 'envio_fiscal')),
  add column if not exists carrier_id uuid references public.transportadoras(id) on delete set null,
  add column if not exists carrier_name text,
  add column if not exists vehicle_plate text,
  add column if not exists filial text,
  add column if not exists armazem text,
  add column if not exists local_estoque text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_user_id uuid references public.portal_users(id) on delete set null,
  add column if not exists delete_reason text;

create index if not exists nf_receipts_reading_point_idx
  on public.nf_receipts(reading_point, captured_at desc);
create index if not exists nf_receipts_carrier_id_idx
  on public.nf_receipts(carrier_id);

alter table public.transportadoras enable row level security;
grant select, insert, update on public.transportadoras to portal_app;
drop policy if exists transportadoras_portal_app on public.transportadoras;
create policy transportadoras_portal_app on public.transportadoras
  for all to portal_app using (true) with check (true);
