-- Uma NF pode ser lida em vários pontos do fluxo.
-- Mantém uma leitura por chave + ponto, preservando a leitura mais recente
-- quando a mesma etapa é registrada novamente.

with duplicates as (
  select id,
         row_number() over (
           partition by access_key, reading_point
           order by captured_at desc, id desc
         ) as position
  from public.nf_receipts
)
delete from public.nf_receipts r
using duplicates d
where r.id = d.id
  and d.position > 1;

alter table public.nf_receipts
  drop constraint if exists nf_receipts_access_key_key;
drop index if exists public.nf_receipts_access_key_key;

create unique index if not exists nf_receipts_access_key_reading_point_key
  on public.nf_receipts (access_key, reading_point);
