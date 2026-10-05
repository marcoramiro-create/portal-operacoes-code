-- REGRA DE NEGÓCIO: preserva a data da última compra lida da planilha de Compras.
alter table public."inventoryAnalytics" add column if not exists "ultimaCompra" date;
