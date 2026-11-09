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
    if (!batch) throw new Error("Nenhum batch SB9 processado encontrado.");
    console.log(`[SB9 monthly] batch=${batch.id} arquivo=${batch.file_name} linhas=${batch.row_count}`);
    versionId = randomUUID();
    await lock.query(
      `insert into public.cost_evolution_sb9_versions (id, source_batch_id, source_file_hash, source_file_name, status)
       values ($1::uuid, $2::uuid, $3, $4, 'building')`,
      [versionId, batch.id, batch.file_hash, batch.file_name],
    );
    source = await pool.connect();
    let written = 0;
    let pending: MonthlyRow[] = [];
    const flush = async () => {
      if (!pending.length) return;
      await insertFacts(source as PoolClient, versionId as string, pending);
      written += pending.length;
      pending = [];
    };
    await source.query("BEGIN");
    await source.query("DECLARE sb9_cursor CURSOR FOR \"" + "\"".replace("\"\"", "") + "");
    await source.query("ROLLBACK");
    throw new Error("PLACEHOLDER");
  } finally {
    if (locked) await lock.query("select pg_advisory_unlock(hashtext($1))", [LOCK_KEY]).catch(() => undefined);
    if (source) (source as PoolClient).release();
    lock.release();
    await pool.end().catch(() => undefined);
  }
}

void main().catch(error => {
  console.error("[SB9 monthly] rebuild falhou; o head publicado anterior não foi alterado:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
