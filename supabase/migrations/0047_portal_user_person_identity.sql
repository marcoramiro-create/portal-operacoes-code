-- Preserva a identidade declarada na solicitação também após a aprovação.
-- O documento é normalizado no backend e aceita CNPJ alfanumérico.
alter table public.portal_users
  add column if not exists person_type text,
  add column if not exists document_number text,
  add column if not exists card_number text;

alter table public.portal_users
  drop constraint if exists portal_users_person_type_check;
alter table public.portal_users
  add constraint portal_users_person_type_check
  check (person_type is null or person_type in ('PF', 'PJ'));

create unique index if not exists portal_users_person_identity_uidx
  on public.portal_users(person_type, document_number)
  where person_type is not null and document_number is not null;

create index if not exists portal_users_document_idx
  on public.portal_users(document_number)
  where document_number is not null;

comment on column public.portal_users.person_type is 'PF ou PJ.';
comment on column public.portal_users.document_number is 'CPF ou CNPJ normalizado, incluindo futuro CNPJ alfanumérico.';
comment on column public.portal_users.card_number is 'Número de cartão/crachá opcional.';

grant select, insert, update on public.portal_users to portal_app;
