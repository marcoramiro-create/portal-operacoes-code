alter table public.nf_receipts
  add column if not exists receipt_type text not null default 'own_stock'
    check (receipt_type in ('own_stock', 'redespacho'));

alter table public.nf_receipts
  add column if not exists flow_status text not null default 'captured'
    check (flow_status in ('captured', 'receiving', 'conference', 'completed', 'pending', 'redespached', 'closed'));

create index if not exists nf_receipts_type_status_idx
  on public.nf_receipts(receipt_type, flow_status, captured_at desc);
