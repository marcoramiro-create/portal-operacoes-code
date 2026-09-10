-- REGRA: preserva a quantidade de pedidos lida da coluna AG da planilha de Compras.
alter table public."inventoryAnalytics" add column if not exists "pedidos" numeric(20,3) not null default 0;
