-- 0028_inventory_analytics_code_original.sql
-- REGRA DE NEGÓCIO (27/09/2026): código de produto/agregado é TEXTO e PRESERVA
-- zeros à esquerda e todos os caracteres (ex.: "03545-mgt").
-- A coluna "code" (normalizada) continua sendo a chave usada nos cruzamentos
-- e na recomendação de IA. A coluna "codeOriginal" guarda o código EXATAMENTE
-- como veio da planilha, para exibição, exportação e telas.

ALTER TABLE "inventoryAnalytics"
  ADD COLUMN IF NOT EXISTS "codeOriginal" varchar(120) NOT NULL DEFAULT '';

-- Registros antigos (já gravados sem o original) recebem o valor atual da coluna
-- "code" como ponto de partida — nada fica vazio. As cargas FUTURAS trarão o
-- código original com os zeros preservados.
UPDATE "inventoryAnalytics"
  SET "codeOriginal" = "code"
  WHERE "codeOriginal" = '';