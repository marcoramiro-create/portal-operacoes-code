import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { materializePurchaseSalesFacts, type PurchaseSalesMonthlyFact, type PurchaseSalesSourceRow } from "./purchaseSalesFacts";

const ADVISORY_LOCK_KEY = "portal_purchase_sales_monthly_store_v1";
const BATCH_SIZE = 500;
const FETCH_SIZE = 1000;

export type PurchaseSalesSourceManifestEntry = {
  id: number;
  fileName: string;
  importedAt: string;
  rowCount: number;
};
type PurchaseSalesSourceState = {
  revision: string;
  imports: PurchaseSalesSourceManifestEntry[];
};

type SourceDbRow = {
  sourceImportId: number;
  sourceRowId: number;
  sourceImportedAt: Date | string;
  branch: string;
  code: string;
  codeOriginal: string | null;
  salesMonths: Record<string, unknown> | null;
};

function fingerprint(manifest: PurchaseSalesSourceState): string {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

function importedAtText(value: Date | string): string {
  const date = value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  if (!Number.isFinite(Date.parse(date))) throw new Error("Data importedAt inválida no manifesto de Compras.");
  return date;
}

async function insertFactBatch(client: PoolClient, versionId: string, facts: PurchaseSalesMonthlyFact[]): Promise<void> {
  if (!facts.length) return;
  const uniqueFacts = new Map<string, PurchaseSalesMonthlyFact>();
  for (const fact of facts) {
    const key = `${fact.branchCode}|${fact.code}|${fact.period}`;
    const current = uniqueFacts.get(key);
    if (!current || fact.sourceImportedAt.getTime() > current.sourceImportedAt.getTime() ||
      (fact.sourceImportedAt.getTime() === current.sourceImportedAt.getTime() && fact.sourceImportId > current.sourceImportId)) {
      uniqueFacts.set(key, fact);
    }
  }
  facts = [...uniqueFacts.values()];
  const values: unknown[] = [];
  const tuples = facts.map((fact, index) => {
    const offset = index * 8;
    values.push(
      versionId,
      fact.branchCode,
      fact.code,
      fact.period,
      String(fact.quantity),
      fact.sourceImportId,
      fact.sourceRowId,
      fact.sourceImportedAt,
    );
    return `($${offset + 1}::uuid,$${offset + 2}::text,$${offset + 3}::text,$${offset + 4}::text,$${offset + 5}::numeric,$${offset + 6}::integer,$${offset + 7}::integer,$${offset + 8}::timestamptz)`;
  });
  await client.query("BEGIN");
  try {
    await client.query(
      `insert into public.purchase_sales_monthly_facts (
         version_id, branch_code, sales_code, period, quantity,
         source_import_id, source_row_id, source_imported_at
       ) values ${tuples.join(",")}
       on conflict (version_id, branch_code, sales_code, period) do update
         set quantity = excluded.quantity,
             source_import_id = excluded.source_import_id,
             source_row_id = excluded.source_row_id,
             source_imported_at = excluded.source_imported_at
       where (excluded.source_imported_at, excluded.source_import_id) >
             (purchase_sales_monthly_facts.source_imported_at, purchase_sales_monthly_facts.source_import_id)`,
      values,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function* streamApprovedPurchaseRows(client: PoolClient): AsyncGenerator<PurchaseSalesSourceRow> {
  let committed = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '90s'");
    await client.query(
    `DECLARE portal_purchase_sales_cursor NO SCROLL CURSOR FOR
       select i.id as "sourceImportId",
              a.id as "sourceRowId",
              i."importedAt" as "sourceImportedAt",
              trim(a.branch) as branch,
              trim(a.code) as code,
              nullif(trim(a."codeOriginal"), '') as "codeOriginal",
              a."salesMonths" as "salesMonths"
         from public."inventoryAnalytics" a
         join public."protheusImports" i on i.id = a."importId"
        where i.status = 'approved'
          and a."salesMonths" is not null
          and a."salesMonths" <> '{}'::jsonb
        order by i.id, a.id`,
    );
    while (true) {
      const batch = await client.query<SourceDbRow>(`FETCH FORWARD ${FETCH_SIZE} FROM portal_purchase_sales_cursor`);
      if (!batch.rows.length) break;
      for (const row of batch.rows) {
        yield {
          sourceImportId: Number(row.sourceImportId),
          sourceRowId: Number(row.sourceRowId),
          sourceImportedAt: row.sourceImportedAt,
          branch: row.branch,
          code: row.code,
          codeOriginal: row.codeOriginal,
          salesMonths: row.salesMonths,
        };
      }
    }
    await client.query("CLOSE portal_purchase_sales_cursor");
    await client.query("COMMIT");
    committed = true;
  } finally {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
  }
}

async function getApprovedSourceManifest(client: Pick<Pool, "query">): Promise<PurchaseSalesSourceState> {
  const result = await client.query<{
    id: number;
    fileName: string;
    importedAt: Date | string;
    rowCount: number;
    revision: string;
  }>(
    `select i.id, i."fileName", i."importedAt", i."rowCount", r.revision::text as revision
       from public."protheusImports" i
       join public.purchase_sales_source_revision r on r.singleton = true
      where i.status = 'approved'
      order by i.id`,
  );
  return {
    revision: result.rows[0]?.revision ?? "none",
    imports: result.rows.map(row => ({
      id: Number(row.id), fileName: row.fileName,
      importedAt: importedAtText(row.importedAt), rowCount: Number(row.rowCount),
    })),
  };
}

async function tableExists(client: PoolClient): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `select to_regclass('public.purchase_sales_monthly_versions') is not null as exists`,
  );
  return result.rows[0]?.exists === true;
}

export async function getPurchaseSalesMonthlyHead(pool: Pick<Pool, "query">): Promise<{
  versionId: string;
  status: string;
  sourceFingerprint: string;
  factRows: number;
  publishedAt: Date | string | null;
} | null> {
  const result = await pool.query<{
    versionId: string;
    status: string;
    sourceFingerprint: string;
    factRows: number;
    publishedAt: Date | string | null;
  }>(
    `select v.id as "versionId", v.status, v.source_fingerprint as "sourceFingerprint",
            v.fact_rows as "factRows", v.published_at as "publishedAt"
       from public.purchase_sales_monthly_head h
       join public.purchase_sales_monthly_versions v on v.id = h.version_id
      where h.singleton = true`,
  );
  return result.rows[0] ?? null;
}

/** Valida se o snapshot publicado ainda corresponde ao conjunto atual de cargas aprovadas. */
export async function isPurchaseSalesMonthlySnapshotCurrent(pool: Pick<Pool, "query">): Promise<boolean> {
  const head = await getPurchaseSalesMonthlyHead(pool);
  if (!head || head.status !== "ready") return false;
  const manifest = await getApprovedSourceManifest(pool);
  return fingerprint(manifest) === head.sourceFingerprint;
}

/** Leitura por chave da tabela mensal; não acessa planilhas nem tabelas brutas. */
export async function readPurchaseSalesMonthlyFacts(
  pool: Pick<Pool, "query">,
  input: { versionId: string; branches: string[]; codes: string[]; periods: string[] },
): Promise<Array<{ branchCode: string; code: string; period: string; quantity: number }>> {
  if (!input.branches.length || !input.codes.length || !input.periods.length) return [];
  const result = await pool.query<{
    branchCode: string;
    code: string;
    period: string;
    quantity: string;
  }>(
    `select branch_code as "branchCode", sales_code as code,
            period, quantity::text as quantity
       from public.purchase_sales_monthly_facts
      where version_id = $1::uuid
        and branch_code = any($2::text[])
        and sales_code = any($3::text[])
        and period = any($4::text[])`,
    [input.versionId, input.branches, input.codes, input.periods],
  );
  return result.rows.map(row => ({
    branchCode: row.branchCode,
    code: row.code,
    period: row.period,
    quantity: Number(row.quantity),
  }));
}

/** Rebuild executado por processo operacional; nenhuma rota de filtro deve chamar este método. */
export async function rebuildPurchaseSalesMonthly(pool: Pool): Promise<{
  versionId: string;
  sourceRows: number;
  factRows: number;
  minPeriod: string | null;
  maxPeriod: string | null;
  sourceFingerprint: string;
}> {
  if ((pool.options?.max ?? 2) < 2) {
    throw new Error("O rebuild exige pool próprio com capacidade mínima de duas conexões (leitura e escrita).");
  }
  const lockClient = await pool.connect();
  let locked = false;
  let versionId: string | null = null;
  let factCount = 0;
  let sourceRows = 0;
  let batch: PurchaseSalesMonthlyFact[] = [];
  const periodBounds = { min: "", max: "" };
  let manifest: PurchaseSalesSourceState = { revision: "none", imports: [] };
  const sourceClient = await pool.connect().catch(async error => {
    lockClient.release();
    throw error;
  });
  try {
    const dbName = await lockClient.query<{ db: string }>("select current_database() as db");
    if (dbName.rows[0]?.db !== "portal_operacoes") {
      throw new Error("Reconstrução bloqueada: somente o banco portal_operacoes da Homologação é permitido nesta fase.");
    }
    if (!(await tableExists(lockClient))) {
      throw new Error("Base de vendas mensais não preparada; aplique a migração aprovada antes do rebuild.");
    }
    const lock = await lockClient.query<{ locked: boolean }>("select pg_try_advisory_lock(hashtext($1)) as locked", [ADVISORY_LOCK_KEY]);
    if (!lock.rows[0]?.locked) throw new Error("Já existe uma reconstrução da base mensal de Compras em andamento.");
    locked = true;

    manifest = await getApprovedSourceManifest(lockClient);
    if (!manifest.imports.length) throw new Error("Não há cargas de Compras aprovadas para materializar.");
    const sourceFingerprint = fingerprint(manifest);
    versionId = randomUUID();
    await lockClient.query(
      `insert into public.purchase_sales_monthly_versions
         (id, status, source_fingerprint, source_manifest, source_rows, fact_rows)
       values ($1::uuid, 'building', $2, $3::jsonb, 0, 0)`,
      [versionId, sourceFingerprint, JSON.stringify(manifest)],
    );

    const countedRows = async function* () {
      for await (const row of streamApprovedPurchaseRows(sourceClient)) {
        sourceRows += 1;
        yield row;
      }
    };
    for await (const fact of materializePurchaseSalesFacts(countedRows())) {
      batch.push(fact);
      if (!periodBounds.min || fact.period < periodBounds.min) periodBounds.min = fact.period;
      if (!periodBounds.max || fact.period > periodBounds.max) periodBounds.max = fact.period;
      if (batch.length >= BATCH_SIZE) {
        await insertFactBatch(lockClient, versionId, batch);
        batch = [];
      }
    }
    if (batch.length) {
      await insertFactBatch(lockClient, versionId, batch);
      batch = [];
    }
    const storedCount = await lockClient.query<{ count: string }>(
      `select count(*)::text as count from public.purchase_sales_monthly_facts where version_id = $1::uuid`,
      [versionId],
    );
    factCount = Number(storedCount.rows[0]?.count ?? 0);
    if (!factCount) throw new Error("As cargas aprovadas não produziram fatos mensais válidos.");

    await lockClient.query("BEGIN");
    try {
      // O mesmo registro é atualizado pelos triggers das fontes. O bloqueio
      // curto serializa commits de correções, aprovações e exclusões.
      await lockClient.query(
        `select public.lock_purchase_sales_source_revision()`,
      );
      const finalManifest = await getApprovedSourceManifest(lockClient);
      const finalFingerprint = fingerprint(finalManifest);
      if (finalFingerprint !== sourceFingerprint) {
        throw new Error("As cargas aprovadas mudaram durante a reconstrução; a nova versão não será publicada.");
      }
      await lockClient.query(
        `update public.purchase_sales_monthly_versions
            set status = 'ready', source_rows = $2, fact_rows = $3,
                min_period = $4, max_period = $5, published_at = now(), error = null
          where id = $1::uuid`,
        [versionId, sourceRows, factCount, periodBounds.min || null, periodBounds.max || null],
      );
      await lockClient.query(
        `insert into public.purchase_sales_monthly_head (singleton, version_id)
         values (true, $1::uuid)
         on conflict (singleton) do update set version_id = excluded.version_id`,
        [versionId],
      );
      await lockClient.query("COMMIT");
    } catch (error) {
      await lockClient.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
    return { versionId, sourceRows, factRows: factCount, minPeriod: periodBounds.min || null, maxPeriod: periodBounds.max || null, sourceFingerprint };
  } catch (error) {
    if (versionId) {
      await lockClient.query(
        `update public.purchase_sales_monthly_versions
            set status = 'failed', error = left($2, 2000)
          where id = $1::uuid and status = 'building'`,
        [versionId, error instanceof Error ? error.message : String(error)],
      ).catch(() => undefined);
    }
    throw error;
  } finally {
    await sourceClient.query("ROLLBACK").catch(() => undefined);
    sourceClient.release();
    if (locked) await lockClient.query("select pg_advisory_unlock(hashtext($1))", [ADVISORY_LOCK_KEY]).catch(() => undefined);
    lockClient.release();
  }
}
