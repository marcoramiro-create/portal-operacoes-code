import { createHash, randomUUID } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { basename } from "node:path";
import os from "node:os";
import { Pool, type PoolClient } from "pg";
import { createSb9StreamParser, type Sb9Row } from "../server/protheusCatalogParsers";
import { parseSourceNumber } from "../server/operationalNormalization";
import {
  assertApprovedSb9ReducedFile,
  assertCompleteSb9RowCount,
  assertExpectedSb9Structure,
  assertNoSkippedSb9Rows,
  EXPECTED_SB9_REDUCED_PATH,
  EXPECTED_SB9_SIZE_BYTES,
  EXPECTED_SB9_VALID_ROWS,
} from "../server/sb9LocalImportRules";

const HOMOLOG_ROOT = "/home/ubuntu/portal-operacoes-homolog";
const MIN_FREE_DISK_BYTES = 6 * 1024 * 1024 * 1024;
const ADVISORY_LOCK_ID = 714049;
const INSERT_ROWS = 500;
const COMMIT_ROWS = 5_000;
const lastArgument = process.argv.at(-1) ?? "";
const sourcePath = lastArgument.startsWith("/") ? lastArgument : EXPECTED_SB9_REDUCED_PATH;
const mode = process.argv.includes("--apply") ? "apply" : "preflight";
const connectionString = process.env.PORTAL_DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL;

type ScanResult = {
  sourceRows: number;
  validRows: number;
  skippedRows: number;
  rowsInBranch0105: number;
  nonemptyUnitCosts: number;
  positiveCosts: number;
  branches: Set<string>;
  products: Set<string>;
  periods: Set<string>;
  sha256: string;
  sizeBytes: number;
  mtimeMs: number;
};

function requireHomologEnvironment() {
  if (process.cwd() !== HOMOLOG_ROOT) {
    throw new Error(`Execução bloqueada: diretório atual deve ser ${HOMOLOG_ROOT}.`);
  }
  if (!connectionString) {
    throw new Error("Conexão do banco de fontes ausente no ambiente transitório da Homologação.");
  }
  let databaseName = "";
  try {
    databaseName = decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ""));
  } catch {
    throw new Error("A conexão configurada para as fontes do Portal não é uma URL válida.");
  }
  if (databaseName !== "portal_operacoes") {
    throw new Error(`Execução bloqueada: a URL aponta para '${databaseName}', não para portal_operacoes.`);
  }
}

function filesystemFreeBytes() {
  const available = Number(process.env.SB9_DATABASE_FS_AVAILABLE_BYTES ?? 0);
  return Number.isSafeInteger(available) && available > 0 ? available : 0;
}

function checkFileSnapshot(filePath: string, expected?: { size: number; mtimeMs: number }) {
  const stat = statSync(filePath);
  assertApprovedSb9ReducedFile(filePath, stat.size);
  if (expected && (stat.size !== expected.size || stat.mtimeMs !== expected.mtimeMs)) {
    throw new Error("Importação cancelada: o arquivo mudou durante a verificação/processamento.");
  }
  return stat;
}

async function scanSb9File(): Promise<ScanResult> {
  const before = checkFileSnapshot(sourcePath);
  const hash = createHash("sha256");
  const branches = new Set<string>();
  const products = new Set<string>();
  const periods = new Set<string>();
  let validRows = 0;
  let rowsInBranch0105 = 0;
  let nonemptyUnitCosts = 0;
  let positiveCosts = 0;
  const parser = createSb9StreamParser((row: Sb9Row) => {
    validRows += 1;
    if (row.branchCode === "0105") rowsInBranch0105 += 1;
    branches.add(row.branchCode);
    products.add(row.productCode);
    periods.add(row.balanceDateIso.slice(0, 7));
    if (row.unitCost1aM.trim() !== "") nonemptyUnitCosts += 1;
    if ((row.unitCost1aMValue ?? 0) > 0) positiveCosts += 1;
  }, 0);

  for await (const chunk of createReadStream(sourcePath, { highWaterMark: 256 * 1024 })) {
    const buffer = chunk as Buffer;
    hash.update(buffer);
    parser.push(buffer);
  }
  const result = parser.finish();
  const after = checkFileSnapshot(sourcePath, { size: before.size, mtimeMs: before.mtimeMs });
  assertCompleteSb9RowCount(validRows);
  assertNoSkippedSb9Rows(result.skippedRows);
  assertExpectedSb9Structure({
    validRows,
    rowsInBranch0105,
    distinctProducts: products.size,
    distinctMonths: periods.size,
    nonemptyUnitCosts,
  });
  if (result.sourceRows !== validRows + result.skippedRows) {
    throw new Error("Pré-verificação cancelada: contadores do parser SB9 não conferem.");
  }

  return {
    sourceRows: result.sourceRows,
    validRows,
    skippedRows: result.skippedRows,
    rowsInBranch0105,
    nonemptyUnitCosts,
    positiveCosts,
    branches,
    products,
    periods,
    sha256: hash.digest("hex"),
    sizeBytes: after.size,
    mtimeMs: after.mtimeMs,
  };
}

async function readDatabaseStatus(client: PoolClient) {
  const db = await client.query<{ database_name: string; database_size: string }>(
    "select current_database() as database_name, pg_database_size(current_database())::text as database_size",
  );
  if (db.rows[0]?.database_name !== "portal_operacoes") {
    throw new Error(`Execução bloqueada: banco conectado é '${db.rows[0]?.database_name ?? "desconhecido"}'.`);
  }
  const latest = await client.query<{
    id: string;
    file_name: string;
    row_count: number;
    imported_at: Date | string;
  }>(
    `select id, file_name, row_count, imported_at
       from public.operational_import_batches
      where source_kind = 'SB9' and status = 'processed'
      order by imported_at desc, id desc
      limit 1`,
  );
  return { databaseSize: Number(db.rows[0]?.database_size ?? 0), latest: latest.rows[0] ?? null };
}

async function runPreflight(client: PoolClient) {
  const scan = await scanSb9File();
  const db = await readDatabaseStatus(client);
  const freeDiskBytes = filesystemFreeBytes();
  const report = {
    mode: "read-only-preflight",
    database: "portal_operacoes",
    sourceFile: basename(sourcePath),
    sourceBytes: scan.sizeBytes,
    sourceSha256: scan.sha256,
    sourceRows: scan.sourceRows,
    validRows: scan.validRows,
    skippedRows: scan.skippedRows,
    rowsInBranch0105: scan.rowsInBranch0105,
    nonemptyUnitCosts: scan.nonemptyUnitCosts,
    positiveCosts: scan.positiveCosts,
    branches: [...scan.branches].sort(),
    distinctProducts: scan.products.size,
    months: [...scan.periods].sort(),
    freeDiskBytes,
    freeDiskGiB: Number((freeDiskBytes / 1024 ** 3).toFixed(2)),
    expectedSizeBytes: EXPECTED_SB9_SIZE_BYTES,
    expectedValidRows: EXPECTED_SB9_VALID_ROWS,
    databaseSizeGiB: Number((db.databaseSize / 1024 ** 3).toFixed(2)),
    memoryAvailableMiB: Math.round(os.freemem() / 1024 ** 2),
    latestProcessedSb9: db.latest
      ? {
          id: db.latest.id,
          fileName: db.latest.file_name,
          rowCount: db.latest.row_count,
          importedAt: db.latest.imported_at,
        }
      : null,
    willDeleteExistingBatches: false,
    targetOutput: "public.operational_source_rows (new lot; previous processed lot is preserved)",
    minimumFreeDiskForApplyGiB: 6,
  };
  console.log(JSON.stringify(report, null, 2));
  return { scan, db, freeDiskBytes };
}

function rawPayload(row: Sb9Row) {
  return {
    filial: row.branchCode,
    produto: row.productCode,
    armazem: row.warehouseCode,
    dataSaldo: row.balanceDate,
    qtdInicialMes: row.initialQuantity,
    saldoInicialMes: row.initialBalance,
    grupo: row.groupCode,
    codigoProdutoAuditoria: row.auditProductCode,
    custoStandard: row.standardCost,
    custoUnitario1aM: row.unitCost1aM,
  };
}

function normalizedPayload(row: Sb9Row) {
  return {
    branchCode: row.branchCode,
    productCode: row.productCode,
    warehouseCode: row.warehouseCode,
    balanceDate: row.balanceDateIso,
    initialQuantity: parseSourceNumber(row.initialQuantity),
    initialBalance: parseSourceNumber(row.initialBalance),
    groupCode: row.groupCode,
    auditProductCode: row.auditProductCode,
    standardCost: parseSourceNumber(row.standardCost),
    unitCost1aM: row.unitCost1aMValue,
  };
}

async function insertRows(client: PoolClient, batchId: string, rows: Array<{ rowNumber: number; row: Sb9Row }>) {
  if (!rows.length) return;
  for (let start = 0; start < rows.length; start += INSERT_ROWS) {
    const chunk = rows.slice(start, start + INSERT_ROWS);
    const params: unknown[] = [];
    const values = chunk.map(({ rowNumber, row }) => {
      const offset = params.length;
      params.push(
        batchId,
        rowNumber,
        row.branchCode,
        row.warehouseCode || null,
        row.productCode,
        row.balanceDateIso,
        parseSourceNumber(row.initialQuantity),
        row.unitCost1aMValue,
        JSON.stringify(rawPayload(row)),
        JSON.stringify(normalizedPayload(row)),
        JSON.stringify([]),
      );
      return `($${offset + 1}::uuid,$${offset + 2},NULL,$${offset + 3},$${offset + 4},$${offset + 5},NULL,$${offset + 6}::date,$${offset + 7},$${offset + 8},NULL,$${offset + 9}::jsonb,$${offset + 10}::jsonb,$${offset + 11}::jsonb)`;
    });
    await client.query(
      `insert into public.operational_source_rows
         (batch_id, source_row_number, operation, branch_code, warehouse_code,
          product_code, aggregate_product_code, event_date, quantity, unit_value,
          total_value, raw_payload, normalized_payload, issue_messages)
       values ${values.join(",")}
       on conflict (batch_id, source_row_number) do nothing`,
      params,
    );
  }
}

async function importRows(client: PoolClient, batchId: string, expected: ScanResult) {
  const hash = createHash("sha256");
  const pending: Array<{ rowNumber: number; row: Sb9Row }> = [];
  let validRows = 0;
  let committedRows = 0;
  const parser = createSb9StreamParser(row => {
    validRows += 1;
    pending.push({ rowNumber: validRows, row });
  }, 0);

  const commit = async (rows: Array<{ rowNumber: number; row: Sb9Row }>) => {
    if (!rows.length) return;
    await client.query("begin");
    try {
      await insertRows(client, batchId, rows);
      await client.query("commit");
      committedRows += rows.length;
      console.log(`[SB9 local] processadas em lotes ${committedRows.toLocaleString("pt-BR")} linhas`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  };

  for await (const chunk of createReadStream(sourcePath, { highWaterMark: 256 * 1024 })) {
    const buffer = chunk as Buffer;
    hash.update(buffer);
    parser.push(buffer);
    while (pending.length >= COMMIT_ROWS) {
      await commit(pending.splice(0, COMMIT_ROWS));
    }
  }
  const parserResult = parser.finish();
  if (pending.length) await commit(pending.splice(0, pending.length));
  const finalStat = checkFileSnapshot(sourcePath, { size: expected.sizeBytes, mtimeMs: expected.mtimeMs });
  const secondHash = hash.digest("hex");
  assertCompleteSb9RowCount(validRows);
  assertNoSkippedSb9Rows(parserResult.skippedRows);
  if (validRows !== expected.validRows || parserResult.sourceRows !== expected.sourceRows || secondHash !== expected.sha256) {
    throw new Error("Integridade da fonte mudou entre varredura e importação; lote será marcado failed e não publicado.");
  }
  const stored = await client.query<{ row_count: string }>(
    "select count(*)::text as row_count from public.operational_source_rows where batch_id = $1::uuid",
    [batchId],
  );
  const storedRows = Number(stored.rows[0]?.row_count ?? 0);
  if (storedRows !== validRows) {
    throw new Error(`Integridade inválida: lidas ${validRows} linhas, persistidas ${storedRows}.`);
  }
  return { parserResult, validRows, committedRows, storedRows, sha256: secondHash, finalSize: finalStat.size };
}

async function runImport(client: PoolClient, scan: ScanResult) {
  const existing = await client.query<{ id: string; status: string; row_count: number }>(
    `select id, status, row_count
       from public.operational_import_batches
      where source_kind = 'SB9' and file_hash = $1
      limit 1`,
    [scan.sha256],
  );
  const old = existing.rows[0];
  if (old?.status === "processed" && Number(old.row_count) === scan.validRows) {
    console.log(JSON.stringify({ status: "already-processed", batchId: old.id, rows: old.row_count }, null, 2));
    return;
  }
  if (old?.status === "processed") {
    throw new Error(
      `Já existe um lote processed para este mesmo arquivo, mas com ${old.row_count} linhas; esperado ${scan.validRows}. Nenhum lote será alterado.`,
    );
  }
  if (old && old.status !== "failed" && old.status !== "received") {
    throw new Error(`Já existe um lote SB9 com este SHA-256 no status '${old.status}'; nenhum dado será alterado.`);
  }

  const batchId = old?.id ?? randomUUID();
  const metadata = {
    source: "Claude sb9-vigia local reduced CSV",
    mode: "local-file-streaming",
    sourcePath,
    sourceSizeBytes: scan.sizeBytes,
    sourceSha256: scan.sha256,
    originalFilePreserved: true,
    existingBatchesPreserved: true,
    preflightValidRows: scan.validRows,
    preflightSkippedRows: scan.skippedRows,
  };

  if (old) {
    await client.query("begin");
    try {
      await client.query("delete from public.operational_source_rows where batch_id = $1::uuid", [batchId]);
      await client.query(
        `update public.operational_import_batches
            set file_name = $2, status = 'received', row_count = 0, metadata = $3::jsonb
          where id = $1::uuid`,
        [batchId, basename(sourcePath), JSON.stringify(metadata)],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  } else {
    await client.query(
      `insert into public.operational_import_batches
         (id, source_kind, file_name, file_hash, status, row_count, metadata)
       values ($1::uuid, 'SB9', $2, $3, 'received', 0, $4::jsonb)`,
      [batchId, basename(sourcePath), scan.sha256, JSON.stringify(metadata)],
    );
  }

  try {
    const result = await importRows(client, batchId, scan);
    const completedMetadata = {
      ...metadata,
      sourceRows: result.parserResult.sourceRows,
      validRows: result.validRows,
      skippedRows: result.parserResult.skippedRows,
      rowsInBranch0105: scan.rowsInBranch0105,
      duplicateRows: result.parserResult.duplicateRows,
      issueCount: result.parserResult.issues.length,
      distinctBranches: scan.branches.size,
      distinctProducts: scan.products.size,
      distinctMonths: scan.periods.size,
      positiveCosts: scan.positiveCosts,
      completedAt: new Date().toISOString(),
    };
    const updated = await client.query(
      `update public.operational_import_batches
          set status = 'processed', row_count = $2, metadata = $3::jsonb, imported_at = now()
        where id = $1::uuid and status = 'received'
        returning id`,
      [batchId, result.validRows, JSON.stringify(completedMetadata)],
    );
    if (!updated.rowCount) throw new Error("O lote não pôde ser publicado como processed.");
    console.log(
      JSON.stringify(
        {
          status: "processed",
          batchId,
          fileName: basename(sourcePath),
          fileBytes: result.finalSize,
          sha256: result.sha256,
          rows: result.validRows,
          rowsPersisted: result.storedRows,
          sourceRows: result.parserResult.sourceRows,
          skippedRows: result.parserResult.skippedRows,
          branches: [...scan.branches].sort(),
          products: scan.products.size,
          months: [...scan.periods].sort(),
          rowsInBranch0105: scan.rowsInBranch0105,
          nonemptyUnitCosts: scan.nonemptyUnitCosts,
          positiveCosts: scan.positiveCosts,
          oldBatchesDeleted: 0,
          sourceFileDeleted: false,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query(
      `update public.operational_import_batches
          set status = 'failed', metadata = metadata || $2::jsonb
        where id = $1::uuid and status = 'received'`,
      [batchId, JSON.stringify({ failure: error instanceof Error ? error.message : String(error), failedAt: new Date().toISOString() })],
    ).catch(() => undefined);
    throw error;
  }
}

async function main() {
  requireHomologEnvironment();
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    application_name: "portal-sb9-local-reduced-import",
  });
  pool.on("error", error => console.error("[SB9 local] Erro no pool:", error.message));
  const client = await pool.connect();
  try {
    const preflight = await runPreflight(client);
    if (mode === "preflight") return;
    if (preflight.freeDiskBytes < MIN_FREE_DISK_BYTES) {
      throw new Error("Aplicação bloqueada: há menos de 6 GiB livres no volume do PostgreSQL. Nada foi gravado.");
    }
    console.log("[SB9 local] pré-verificação completa aprovada; lote antigo preservado; iniciando gravação em lotes");
    await client.query("select pg_advisory_lock($1)", [ADVISORY_LOCK_ID]);
    try {
      await runImport(client, preflight.scan);
    } finally {
      await client.query("select pg_advisory_unlock($1)", [ADVISORY_LOCK_ID]).catch(() => undefined);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch(error => {
  console.error("[SB9 local] falha:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
