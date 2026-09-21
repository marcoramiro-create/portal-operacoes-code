-- Finaliza a migration 0023 quando a instalação foi interrompida antes de grants/policies.
-- Idempotente: pode ser aplicada tanto após a 0023 parcial quanto em uma instalação completa.
-- O tipo do produto está em products.product_type; não existe tabela product_types.

alter table public.operational_import_batches enable row level security;
alter table public.product_aggregates enable row level security;
alter table public.product_aggregate_members enable row level security;
alter table public.sbz_product_curves enable row level security;
alter table public.products enable row level security;

grant usage on schema public to portal_app;
grant select, insert, update on public.product_aggregates to portal_app;
grant select, insert, update on public.product_aggregate_members to portal_app;
grant select, insert, update on public.sbz_product_curves to portal_app;
grant select, insert, update on public.products to portal_app;
grant update on public.operational_import_batches to portal_app;

drop policy if exists products_portal_app on public.products;
create policy products_portal_app on public.products for all to portal_app using (true) with check (true);
drop policy if exists product_aggregates_portal_app on public.product_aggregates;
create policy product_aggregates_portal_app on public.product_aggregates for all to portal_app using (true) with check (true);
drop policy if exists product_aggregate_members_portal_app on public.product_aggregate_members;
create policy product_aggregate_members_portal_app on public.product_aggregate_members for all to portal_app using (true) with check (true);
drop policy if exists sbz_product_curves_portal_app on public.sbz_product_curves;
create policy sbz_product_curves_portal_app on public.sbz_product_curves for all to portal_app using (true) with check (true);
