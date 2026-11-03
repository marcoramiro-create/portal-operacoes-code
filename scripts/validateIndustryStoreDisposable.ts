import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Ambiente descartável de validação; nunca utiliza URLs de banco do Portal.
// @ts-ignore dependência isolada já instalada no sandbox de testes
import { PGlite } from '/home/ubuntu/portal-sql-validation/node_modules/@electric-sql/pglite/dist/index.js';
import { rebuildIndustryConsumption, readIndustryConsumption } from '../server/industryConsumptionStore';
import type { Pool } from 'pg';

const db = new PGlite();
const sql = await readFile('supabase/migrations/0056_industry_consumption_store.sql', 'utf8');
const trace: string[] = [];
const client = {
  async query(text: string, params: unknown[] = []) {
    trace.push(text);
    return db.query(text, params);
  },
  release() {},
};
const pool = { connect: async () => client } as unknown as Pool;
try {
  await assert.rejects(() => db.exec(sql), /somente para portal_operacoes/);
  await db.exec('ROLLBACK');
  // PGlite usa um único database chamado postgres: alterar só o guard nesta cópia descartável.
  const disposableSql = sql.replace("current_database() <> 'portal_operacoes'", "'portal_operacoes' <> 'portal_operacoes'");
  await db.exec('CREATE ROLE portal_app; CREATE ROLE portal_app_homolog;');
  await db.exec(disposableSql);
  await db.exec(disposableSql);
  await db.exec(`
    CREATE TABLE public.operational_import_batches (
      id uuid PRIMARY KEY, source_kind text, status text, file_hash text, row_count integer,
      imported_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.operational_source_rows (
      batch_id uuid, branch_code text, product_code text, aggregate_product_code text,
      normalized_payload jsonb
    );
    INSERT INTO public.operational_import_batches (id,source_kind,status,file_hash,row_count) VALUES
      ('00000000-0000-0000-0000-000000000001','FECHAMENTO_ESTOQUE','processed','stock-hash',2200),
      ('00000000-0000-0000-0000-000000000002','ENTRADA_NF','processed','entry-hash',1100);
    INSERT INTO public.operational_source_rows
    SELECT '00000000-0000-0000-0000-000000000001', '0105', lpad(g::text,5,'0')||'-MGT',
      '000AG-'||(g % 10)::text, jsonb_build_object('year','2024','month','12','totalValue',100)
    FROM generate_series(0,1099) g;
    INSERT INTO public.operational_source_rows
    SELECT '00000000-0000-0000-0000-000000000001', '0105', lpad(g::text,5,'0')||'-MGT',
      '000AG-'||(g % 10)::text, jsonb_build_object('year','2025','month','1','totalValue',80)
    FROM generate_series(0,1099) g;
    INSERT INTO public.operational_source_rows
    SELECT '00000000-0000-0000-0000-000000000002', '0105', lpad(g::text,5,'0')||'-MGT',
      '000AG-'||(g % 10)::text, jsonb_build_object('entryDate','2025-01-15','quantity',2,'itemValue',5)
    FROM generate_series(0,1099) g;
  `);
  await assert.rejects(() => readIndustryConsumption(pool, ['202501'], '0105'), /NAO_PREPARADA/);
  const result = await rebuildIndustryConsumption(pool);
  assert.equal(result.sourceRows,3300);
  assert.equal(result.monthlyRows,10);
  assert.equal(result.stockRows,2200);
  assert.ok(trace.filter(x=>x.startsWith('FETCH FORWARD')).length>4);
  trace.length=0;
  const read = await readIndustryConsumption(pool,['202501'],'0105');
  assert.equal([...read.consumo.values()].reduce((a,b)=>a+b,0),1100*30);
  assert.equal([...read.estoqueAgregado.values()].reduce((a,b)=>a+b,0),1100*80);
  assert.equal(read.versionId,result.versionId);
  assert.equal(read.stale,false);
  assert.ok(!trace.some(x=>x.includes('operational_source_rows')));
  const selected = await readIndustryConsumption(pool,['202501'],'0105',['00000-MGT']);
  assert.equal(selected.estoqueAgregado.get('0105|000AG-0'),80);
  await db.exec("UPDATE public.operational_import_batches SET file_hash='changed' WHERE source_kind='ENTRADA_NF'");
  await assert.rejects(()=>readIndustryConsumption(pool,['202501'],'0105'),/DESATUALIZADA/);
  await db.exec(`INSERT INTO public.operational_source_rows VALUES
    ('00000000-0000-0000-0000-000000000001','0105','INVALID','INVALID',
     '{"year":"2025","month":"01","totalValue":"bad"}'::jsonb)`);
  await assert.rejects(()=>rebuildIndustryConsumption(pool),/inválido/);
  const head = await db.query<{ version_id:string }>('SELECT version_id FROM public.industry_consumption_head');
  assert.equal(head.rows[0].version_id,result.versionId);
  const failed = await db.query<{ n:number }>("SELECT count(*)::int as n FROM public.industry_consumption_versions WHERE status='failed'");
  assert.equal(failed.rows[0].n,1);
  console.log('PASS: SQL PostgreSQL descartável: guard, migração idempotente/grants, 3300 fontes, FETCH1000, INSERT500, soma, filtro, ausência/stale, falha sem trocar head.');
} finally {
  await db.close();
}
