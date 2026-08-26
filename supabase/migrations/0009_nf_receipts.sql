create table if not exists public.nf_receipts (
  id uuid primary key default gen_random_uuid(),
  access_key char(44) not null unique check (access_key ~ '^[0-9]{44}$'),
  issuer_cnpj char(14) not null,
  invoice_model char(2) not null,
  invoice_series char(3) not null,
  invoice_number char(9) not null,
  issued_year_month char(4) not null,
  capture_method text not null check (capture_method in ('manual', 'camera', 'barcode_reader')),
  captured_by_user_id uuid not null references public.portal_users(id) on delete restrict,
  captured_at timestamptz not null default now(),
  protheus_sc7_reference text,
  nf_legal_reference text,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nf_receipts_captured_at_idx on public.nf_receipts(captured_at desc);
create index if not exists nf_receipts_issuer_cnpj_idx on public.nf_receipts(issuer_cnpj);
create index if not exists nf_receipts_invoice_number_idx on public.nf_receipts(invoice_number);
alter table public.nf_receipts enable row level security;
