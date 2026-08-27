alter table public.products add column if not exists inventory_control_category text not null default 'other';
alter table public.products drop constraint if exists products_inventory_control_category_check;
alter table public.products add constraint products_inventory_control_category_check check (inventory_control_category in ('consumable', 'epi', 'uniform', 'tool', 'other'));
