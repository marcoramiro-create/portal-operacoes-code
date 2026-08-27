alter table public.cost_centers
  add column if not exists branch_id uuid references public.branches(id) on delete restrict;

alter table public.cost_centers drop constraint if exists cost_centers_code_key;
create unique index if not exists cost_centers_branch_code_key on public.cost_centers(branch_id, code);
create index if not exists cost_centers_branch_id_idx on public.cost_centers(branch_id);
