import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

const PROD_ROOT = "/home/ubuntu/portal-operacoes-production";
const LOCK_KEY = "portal_cost_evolution_sb9_monthly_v1"; // mesmo lock: impede rebuild concorrente
const WRITE_BATCH = 500;

if (process.cwd() !== PROD_ROOT) {
  throw new Error(`Reconstrução SB9 bloqueada: execute somente em ${PROD_ROOT}.`);
}
if (process.env.SB9_MONTHLY_REBUILD_CONFIRM !== "PRODUCAO") {
  throw new Error("Reconstrução SB9 bloqueada; defina SB9_MONTHLY_REBUILD_CONFIRM=PRODUCAO somente ao executar na Produção.");
}
const connectionString = process.env.PORTAL_DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL;
if (!connectionString || decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, "")) !== "portal_operacoes_prod") {
  throw new Error("Reconstrução SB9 bloqueada: a conexão deve apontar para portal_operacoes_prod.");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 2,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 10_000,
  application_name: "portal-sb9-monthly-rebuild-prod",
});

type Batch = { id: string; file_hash: string; file_name: string; row_count: number };
type MonthlyRow = { branch: string; product: string; period: string; cost: string; sourceRows: number };

async function latestBatch(client: Pick<PoolClient, "query">): Promise<Batch | null> {
  const result = await client.query<Batch>(
    `select id::text, file_hash, file_name, row_count
       from public.operational_import_batches
      where source_kind = 'SB9' and status = 'processed'
      order by imported_at desc, id desc limit 1`,
  );
  return result.rows[0] ?? null;
}

async function insertFacts(client: PoolClient, versionId: string, facts: MonthlyRow[]) {
  if (!facts.length) return;
  const params: unknown[] = [];
  const tuples = facts.map((fact, index) => {
    const n = index * 6;
    params.push(versionId, fact.branch, fact.product, fact.period, fact.cost, fact.sourceRows);
    return `($${n + 1}::uuid,$${n + 2}::text,$${n + 3}::text,$${n + 4}::text,$${n + 5}::numeric,$${n + 6}::integer)`;
  });
  await client.query("BEGIN");
  try {
    await client.query(
      `insert into public.cost_evolution_sb9_monthly
         (version_id, branch_code, product_code, period, unit_value, source_rows)
       values ${tuples.join(",")}
       on conflict (version_id, branch_code, product_code, period) do update
         set unit_value = excluded.unit_value, source_rows = excluded.source_rows`,
      params,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function main() {
  const lock = await pool.connect();
  let source: PoolClient | null = null;
  let locked = false;
  let versionId: string | null = null;
  try {
    const db = await lock.query<{ name: string }>("select current_database() as name");
    if (db.rows[0]?.name !== "portal_operacoes_prod") throw new Error("Conexão ativa não é portal_operacoes_prod.");
    await lock.query("select pg_advisory_lock(hashtext($1))", [LOCK_KEY]);
    locked = true;
    const batch = await latestBatch(lock);
    if (!batch) throw new Error("Não existe lote SB9 processed para materializar.");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(batch.id)) {
      throw new Error("O ID do lote SB9 não é um UUID válido.");
    }

    const already = await lock.query<{ id: string }>(
      `select id::text from public.cost_evolution_sb9_versions
        where source_batch_id = $1::uuid and source_file_hash = $2 and status = 'ready'
        limit 1`,
      [batch.id, batch.file_hash],
    );
    if (already.rows[0]) {
      await lock.query(
        `insert into public.cost_evolution_sb9_head(singleton, version_id)
         values (true, $1::uuid)
         on conflict (singleton) do update set version_id = excluded.version_id`,
        [already.rows[0].id],
      );
      console.log(JSON.stringify({ status: "already_materialized", sourceBatchId: batch.id, versionId: already.rows[0].id, headRepaired: true }));
      return;
    }

    versionId = randomUUID();
    await lock.query(
      `insert into public.cost_evolution_sb9_versions
         (id, source_batch_id, source_file_hash, source_file_name, status)
       values ($1::uuid, $2::uuid, $3, $4, 'building')`,
      [versionId, batch.id, batch.file_hash, batch.file_name],
    );

    source = await pool.connect();
    await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await source.query("SET LOCAL statement_timeout = '0'");
    await source.query("SET LOCAL work_mem = '16MB'");
    await source.query(
      `DECLARE portal_sb9_monthly_cursor NO SCROLL CURSOR FOR
       select branch_code as branch,
              product_code as product,
              to_char(event_date, 'YYYYMM') as period,
              max(unit_value)::text as cost,
              count(*)::integer as "sourceRows"
         from public.operational_source_rows
        where batch_id = '${batch.id}'::uuid
          and branch_code is not null and branch_code <> ''
          and product_code is not null and product_code <> ''
          and event_date is not null and unit_value is not null
        group by branch_code, product_code, to_char(event_date, 'YYYYMM')`,
    );

    let sourceRows = 0;
    let factRows = 0;
    let batchFacts: MonthlyRow[] = [];
    const flush = async () => {
      if (!batchFacts.length) return;
      await insertFacts(lock, versionId!, batchFacts);
      factRows += batchFacts.length;
      batchFacts = [];
    };
    while (true) {
      const rows = await source.query<MonthlyRow>("FETCH FORWARD 1000 FROM portal_sb9_monthly_cursor");
      if (!rows.rows.length) break;
      for (const row of rows.rows) {
        row.sourceRows = Number(row.sourceRows);
        sourceRows += row.sourceRows;
        batchFacts.push(row);
        if (batchFacts.length >= WRITE_BATCH) await flush();
      }
      console.log(`[SB9 monthly] source_rows=${sourceRows} monthly_facts_written=${factRows + batchFacts.length}`);
    }
    await flush();
    await source.query("CLOSE portal_sb9_monthly_cursor");
    await source.query("COMMIT");
    await source.release();
    source = null;

    if (sourceRows !== Number(batch.row_count)) {
      throw new Error(`Contagem da fonte diverge do lote: cursor=${sourceRows}, batch.row_count=${batch.row_count}.`);
    }
    if (!factRows) throw new Error("A SB9 não produziu fatos mensais para leitura.");
    await lock.query("ANALYZE public.cost_evolution_sb9_monthly");
    const batchNow = await latestBatch(lock);
    if (!batchNow || batchNow.id !== batch.id || batchNow.file_hash !== batch.file_hash || batchNow.row_count !== batch.row_count) {
      throw new Error("A carga SB9 mais recente mudou durante o rebuild; a nova versão não será publicada.");
    }

    await lock.query("BEGIN");
    try {
      await lock.query(
        `update public.cost_evolution_sb9_versions
            set status = 'ready', source_rows = $2, fact_rows = $3, published_at = now(), error = null
          where id = $1::uuid`,
        [versionId, sourceRows, factRows],
      );
      await lock.query(
        `insert into public.cost_evolution_sb9_head(singleton, version_id)
         values (true, $1::uuid)
         on conflict (singleton) do update set version_id = excluded.version_id`,
        [versionId],
      );
      await lock.query("COMMIT");
    } catch (error) {
      await lock.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
    console.log(JSON.stringify({ status: "ready", database: "portal_operacoes_prod", sourceBatchId: batch.id, sourceFile: batch.file_name, sourceRows, factRows, versionId }));
  } catch (error) {
    if (source) {
      await source.query("ROLLBACK").catch(() => undefined);
      source.release();
      source = null;
    }
    if (versionId) {
      await lock.query(
        `update public.cost_evolution_sb9_versions
            set status = 'failed', error = left($2, 2000)
          where id = $1::uuid and status = 'building'`,
        [versionId, error instanceof Error ? error.message : String(error)],
      ).catch(() => undefined);
    }
    throw error;
  } finally {
    if (source) {
      await source.query("ROLLBACK").catch(() => undefined);
      source.release();
    }
    if (locked) await lock.query("select pg_advisory_unlock(hashtext($1))", [LOCK_KEY]).catch(() => undefined);
    lock.release();
  }
}

main().catch(error => {
  console.error("[SB9 monthly] rebuild falhou; o head publicado anterior não foi alterado:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
