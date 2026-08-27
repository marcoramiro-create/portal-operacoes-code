-- A identificação comercial do fornecedor no Protheus é composta por código e loja.
-- Registros anteriores sem loja recebem apenas um marcador técnico de legado para não
-- inventar uma loja operacional e permanecerem distintos durante a transição.
alter table public.suppliers add column if not exists store_code text;

update public.suppliers
set store_code = '__LEGADO_SEM_LOJA__'
where store_code is null or btrim(store_code) = '';

alter table public.suppliers alter column store_code set not null;

alter table public.suppliers drop constraint if exists suppliers_supplier_code_key;
alter table public.suppliers drop constraint if exists suppliers_document_number_key;

create unique index if not exists suppliers_code_store_unique
  on public.suppliers (supplier_code, store_code);
