-- Cadastro inicial informado pelo próprio solicitante.
-- Não guarda senha, token ou documento em texto fora do banco do portal.
alter table public.user_access_requests
  add column if not exists requested_display_name text,
  add column if not exists person_type text,
  add column if not exists document_number text,
  add column if not exists card_number text;

alter table public.user_access_requests
  drop constraint if exists user_access_requests_person_type_check;
alter table public.user_access_requests
  add constraint user_access_requests_person_type_check
  check (person_type is null or person_type in ('PF', 'PJ'));

create index if not exists user_access_requests_document_idx
  on public.user_access_requests(document_number)
  where document_number is not null;

comment on column public.user_access_requests.person_type is 'PF ou PJ; novos CNPJs podem ser alfanuméricos.';
comment on column public.user_access_requests.document_number is 'CPF ou CNPJ normalizado, preservando letras e zeros à esquerda.';
comment on column public.user_access_requests.card_number is 'Número de cartão/crachá; opcional para PJ.';

grant select, insert, update on public.user_access_requests to portal_app;
