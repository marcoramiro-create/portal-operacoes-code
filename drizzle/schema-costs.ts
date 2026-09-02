// drizzle/schema-costs.ts
import { pgTable, pgEnum, serial, varchar, boolean, text, numeric, timestamp } from 'drizzle-orm/pg-core';

// Enum sheet_type — confirme os valores com o que você criou no Supabase
export const sheetTypeEnum = pgEnum('sheet_type', ['pecas', 'industria']);

export const costRecords = pgTable('cost_records', {
  id: serial('id').primaryKey(),
  filial: varchar('filial').notNull(),
  sheet_type: sheetTypeEnum('sheet_type').notNull(),
  cod_agregado: varchar('cod_agregado').notNull(),
  codigo: varchar('codigo').notNull(),
  entra_mrp: boolean('entra_mrp'),
  descricao: text('descricao'),
  comprador_codigo: varchar('comprador_codigo'),
  comprador_nome: varchar('comprador_nome'),
  ultima_compra: varchar('ultima_compra'),
  ultimo_preco: numeric('ultimo_preco'),
  period: varchar('period').notNull(),
  custo_medio: numeric('custo_medio'),
  source_file: varchar('source_file'),
  imported_at: timestamp('imported_at', { mode: 'date' }),
});