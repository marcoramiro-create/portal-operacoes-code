-- Corrige a visibilidade dos cadastros para a aplicação na homologação.
-- Não altera dados. Idempotente.

begin;

do $$
declare
  item text;
begin
  foreach item in array array[
    'companies',
    'branches',
    'org_units',
    'cost_centers',
    'product_types',
    'products',
    'warehouses',
    'stock_locations',
    'departments',
    'job_positions'
  ] loop
    execute format('alter table public.%I enable row level security', item);
    execute format('drop policy if exists portal_app_catalog_full_access on public.%I', item);
    execute format('create policy portal_app_catalog_full_access on public.%I for all to portal_app using (true) with check (true)', item);
  end loop;
end $$;

commit;
