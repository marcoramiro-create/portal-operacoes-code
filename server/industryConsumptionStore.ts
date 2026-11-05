import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";

const INDUSTRY_BRANCH = "0105";
const ADVISORY_LOCK_KEY = "portal_industry_consumption_store_v1";
const BATCH_SIZE = 500;
const FETCH_SIZE = 1000;
const BASE_NOT_PREPARED = "BASE_INDUSTRIAL_NAO_PREPARADA";
const BASE_OUTDATED = "BASE_INDUSTRIAL_DESATUALIZADA";
const SOURCE_KINDS = ["FECHAMENTO_ESTOQUE", "ENTRADA_NF"] as const;
type SourceKind = (typeof SOURCE_KINDS)[number];

export type IndustryClosingSourceRow = {
  branch: unknown;
  product: unknown;
  aggregate: unknown;
  year: unknown;
  month: unknown;
  totalValue: unknown;
};

export type IndustryEntrySourceRow = {
  branch: unknown;
  product: unknown;
  aggregate?: unknown;
  entryDate: unknown;
  quantity: unknown;
  itemValue: unknown;
};

export type IndustryConsumptionMonthlyFact = {
  branchCode: string;
  aggregateCode: string;
  period: string;
  consumptionValue: number;
};

export type IndustryStockMonthlyFact = {
  branchCode: string;
  productCode: string;
  aggregateCode: string;
  period: string;
  stockValue: number;
};

export type IndustrySourceManifestBatch = {
  id: string;
  sourceKind: SourceKind;
  fileHash: string;
  rowCount: number;
  importedAt: string;
};

export type IndustrySourceManifest = {
  batches: IndustrySourceManifestBatch[];
  sourceRows: number;
  stockRows: number;
  entryRows: number;
};

type ClosingValue = { aggregateCode: string; value: number };
type ClosingByProduct = Map<string, Map<string, ClosingValue>>;
type EntryByProduct = Map<string, Map<string, number>>;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} deve ser um montante finito`);
}

export function previousIndustryPeriod(period: string): string {
  assertPeriod(period, "period");
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));
  return month === 1 ? `${year - 1}12` : `${year}${String(month - 1).padStart(2, "0")}`;
}

export function nextIndustryPeriod(period: string): string {
  assertPeriod(period, "period");
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));
  return month === 12 ? `${year + 1}01` : `${year}${String(month + 1).padStart(2, "0")}`;
}

export function assertPeriod(period: string, name = "period"): void {
  if (!/^\d{6}$/.test(period)) throw new Error(`${name} inválido; esperado YYYYMM`);
  const month = Number(period.slice(4, 6));
  const year = Number(period.slice(0, 4));
  if (year < 1 || month < 1 || month > 12) throw new Error(`${name} inválido; esperado YYYYMM`);
}

function periodFromYearMonth(yearValue: unknown, monthValue: unknown): string {
  const year = text(yearValue);
  const month = text(monthValue);
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) {
    throw new Error(`FECHAMENTO_ESTOQUE possui ano/mês inválido: ${year}-${month}`);
  }
  const period = `${year}${month.padStart(2, "0")}`;
  assertPeriod(period, "FECHAMENTO_ESTOQUE.period");
  return period;
}

function periodFromEntryDate(value: unknown): string {
  const raw = text(value);
  const match = /^(\d{4})-(\d{2})(?:-|$)/.exec(raw);
  if (!match) throw new Error(`ENTRADA_NF possui entryDate inválida: ${raw}`);
  const period = `${match[1]}${match[2]}`;
  assertPeriod(period, "ENTRADA_NF.period");
  return period;
}

function numeric(value: unknown, label: string): number {
  const raw = text(value);
  if (!raw || !/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) {
    throw new Error(`${label} inválido: ${raw || "vazio"}`);
  }
  const parsed = Number(raw);
  assertFinite(parsed, label);
  return parsed;
}

function ensureBranchProduct(branchValue: unknown, productValue: unknown, kind: string): { branch: string; product: string } {
  const branch = text(branchValue);
  const product = text(productValue);
  if (!branch || !product) throw new Error(`${kind} possui filial/produto vazio`);
  if (branch !== INDUSTRY_BRANCH) throw new Error(`${kind} fora da filial industrial ${INDUSTRY_BRANCH}: ${branch}`);
  return { branch, product };
}

function aggregateCode(aggregateValue: unknown, product: string): string {
  return text(aggregateValue) || product;
}

function updateClosing(map: ClosingByProduct, row: IndustryClosingSourceRow): string {
  const { branch, product } = ensureBranchProduct(row.branch, row.product, "FECHAMENTO_ESTOQUE");
  const period = periodFromYearMonth(row.year, row.month);
  const value = numeric(row.totalValue, "FECHAMENTO_ESTOQUE.totalValue");
  const aggregate = aggregateCode(row.aggregate, product);
  let periods = map.get(`${branch}\u0000${product}`);
  if (!periods) {
    periods = new Map();
    map.set(`${branch}\u0000${product}`, periods);
  }
  const current = periods.get(period);
  periods.set(period, {
    aggregateCode: aggregate,
    value: (current?.value ?? 0) + value,
  });
  return period;
}

function updateEntry(map: EntryByProduct, row: IndustryEntrySourceRow): string {
  const { branch, product } = ensureBranchProduct(row.branch, row.product, "ENTRADA_NF");
  const period = periodFromEntryDate(row.entryDate);
  const quantity = numeric(row.quantity, "ENTRADA_NF.quantity");
  const itemValue = numeric(row.itemValue, "ENTRADA_NF.itemValue");
  const value = quantity * itemValue;
  assertFinite(value, "ENTRADA_NF.quantity * itemValue");
  const key = `${branch}\u0000${product}`;
  let periods = map.get(key);
  if (!periods) {
    periods = new Map();
    map.set(key, periods);
  }
  periods.set(period, (periods.get(period) ?? 0) + value);
  assertFinite(periods.get(period) ?? 0, "ENTRADA_NF.total");
  return period;
}

function splitProductKey(key: string): { branch: string; product: string } {
  const separator = key.indexOf("\u0000");
  return { branch: key.slice(0, separator), product: key.slice(separator + 1) };
}

export type BuiltIndustryFacts = {
  monthly: IndustryConsumptionMonthlyFact[];
  stock: IndustryStockMonthlyFact[];
  minPeriod: string;
  maxPeriod: string;
  stockRows: number;
  entryRows: number;
  sourceRows: number;
};

/**
 * Pure O(n) materialization of the two operational sources. Duplicate product/month
 * rows are summed and the last observed aggregate is retained, matching the old
 * accumulator behavior. Only an exactly consecutive previous closing can calculate.
 */
export function buildIndustryConsumptionFacts(
  closings: IndustryClosingSourceRow[],
  entries: IndustryEntrySourceRow[],
): BuiltIndustryFacts {
  const closingMap: ClosingByProduct = new Map();
  const entryMap: EntryByProduct = new Map();
  const periods: string[] = [];
  for (const row of closings) periods.push(updateClosingAndGetPeriod(closingMap, row));
  for (const row of entries) periods.push(updateEntry(entryMap, row));
  if (!closings.length || !entries.length) {
    throw new Error("A base industrial exige linhas nas fontes FECHAMENTO_ESTOQUE e ENTRADA_NF");
  }
  if (!periods.length) throw new Error("A base industrial não possui períodos válidos");

  const stock: IndustryStockMonthlyFact[] = [];
  const monthlyByKey = new Map<string, number>();
  for (const [productKey, productPeriods] of closingMap) {
    const { branch, product } = splitProductKey(productKey);
    for (const [period, closing] of productPeriods) {
      assertFinite(closing.value, "FECHAMENTO_ESTOQUE.saldo");
      stock.push({
        branchCode: branch,
        productCode: product,
        aggregateCode: closing.aggregateCode,
        period,
        stockValue: closing.value,
      });
      const previous = productPeriods.get(previousIndustryPeriod(period));
      if (!previous) continue;
      const entryValue = entryMap.get(productKey)?.get(period) ?? 0;
      const consumption = Math.max(0, previous.value + entryValue - closing.value);
      assertFinite(consumption, "consumo industrial");
      const key = `${branch}|${closing.aggregateCode}|${period}`;
      monthlyByKey.set(key, (monthlyByKey.get(key) ?? 0) + consumption);
    }
  }

  const monthly: IndustryConsumptionMonthlyFact[] = [];
  for (const [key, consumptionValue] of monthlyByKey) {
    const [branchCode, aggregateCode, period] = key.split("|");
    monthly.push({ branchCode, aggregateCode, period, consumptionValue });
  }
  monthly.sort((a, b) => `${a.branchCode}|${a.aggregateCode}|${a.period}`.localeCompare(`${b.branchCode}|${b.aggregateCode}|${b.period}`));
  stock.sort((a, b) => `${a.branchCode}|${a.productCode}|${a.period}`.localeCompare(`${b.branchCode}|${b.productCode}|${b.period}`));

  return {
    monthly,
    stock,
    minPeriod: periods.reduce((min, period) => (period < min ? period : min), periods[0]),
    maxPeriod: periods.reduce((max, period) => (period > max ? period : max), periods[0]),
    stockRows: stock.length,
    entryRows: entries.length,
    sourceRows: closings.length + entries.length,
  };
}

function updateClosingAndGetPeriod(map: ClosingByProduct, row: IndustryClosingSourceRow): string {
  return updateClosing(map, row);
}

function canonicalManifestBatches(batches: IndustrySourceManifestBatch[]): IndustrySourceManifestBatch[] {
  return [...batches].sort((a, b) => a.id.localeCompare(b.id));
}

export function industrySourceFingerprint(batches: IndustrySourceManifestBatch[]): string {
  const canonical = canonicalManifestBatches(batches).map(batch => ({
    id: batch.id,
    sourceKind: batch.sourceKind,
    fileHash: batch.fileHash,
    rowCount: batch.rowCount,
    importedAt: batch.importedAt,
  }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function normalizeManifestBatch(row: {
  id: unknown;
  sourceKind: unknown;
  fileHash: unknown;
  rowCount: unknown;
  importedAt: unknown;
}): IndustrySourceManifestBatch {
  const sourceKind = text(row.sourceKind) as SourceKind;
  if (!SOURCE_KINDS.includes(sourceKind)) throw new Error(`source_kind industrial inválido: ${sourceKind}`);
  const rowCount = Number(row.rowCount);
  if (!Number.isInteger(rowCount) || rowCount < 0) throw new Error(`row_count inválido no lote ${text(row.id)}`);
  const importedAt = row.importedAt instanceof Date ? row.importedAt.toISOString() : text(row.importedAt);
  if (!text(row.id) || !text(row.fileHash) || !importedAt) throw new Error("Manifesto industrial possui lote incompleto");
  return { id: text(row.id), sourceKind, fileHash: text(row.fileHash), rowCount, importedAt };
}

async function readRelevantManifest(client: Pick<PoolClient, "query">): Promise<IndustrySourceManifestBatch[]> {
  const result = await client.query<{
    id: string;
    sourceKind: string;
    fileHash: string;
    rowCount: number | string;
    importedAt: string | Date;
  }>(
    `select b.id::text as id, b.source_kind as "sourceKind", b.file_hash as "fileHash",
            b.row_count as "rowCount", b.imported_at as "importedAt"
       from public.operational_import_batches b
      where b.status = 'processed'
        and b.source_kind in ('FECHAMENTO_ESTOQUE', 'ENTRADA_NF')
      order by b.id`,
  );
  return result.rows.map(normalizeManifestBatch);
}

function makeManifest(batches: IndustrySourceManifestBatch[], facts: BuiltIndustryFacts): IndustrySourceManifest {
  return {
    batches: canonicalManifestBatches(batches),
    sourceRows: facts.sourceRows,
    stockRows: facts.stockRows,
    entryRows: facts.entryRows,
  };
}

async function fetchCursorRows<Row extends QueryResultRow>(
  client: Pick<PoolClient, "query">,
  cursorName: string,
  query: string,
  parameters: unknown[],
  onRows: (rows: Row[]) => Promise<void> | void,
): Promise<void> {
  await client.query(`DECLARE ${cursorName} NO SCROLL CURSOR FOR ${query}`, parameters);
  try {
    while (true) {
      const batch = await client.query<Row>(`FETCH FORWARD ${FETCH_SIZE} FROM ${cursorName}`);
      if (!batch.rows.length) break;
      await onRows(batch.rows);
    }
  } finally {
    await client.query(`CLOSE ${cursorName}`).catch(() => undefined);
  }
}

const closingSourceSql = `
  select trim(r.branch_code) as branch, trim(r.product_code) as product,
         nullif(trim(r.aggregate_product_code), '') as aggregate,
         r.normalized_payload->>'year' as year,
         r.normalized_payload->>'month' as month,
         r.normalized_payload->>'totalValue' as "totalValue"
    from public.operational_import_batches b
    join public.operational_source_rows r on r.batch_id = b.id
   where b.status = 'processed' and b.source_kind = 'FECHAMENTO_ESTOQUE'
     and trim(r.branch_code) = $1
`;

const entrySourceSql = `
  select trim(r.branch_code) as branch, trim(r.product_code) as product,
         nullif(trim(r.aggregate_product_code), '') as aggregate,
         r.normalized_payload->>'entryDate' as "entryDate",
         r.normalized_payload->>'quantity' as quantity,
         r.normalized_payload->>'itemValue' as "itemValue"
    from public.operational_import_batches b
    join public.operational_source_rows r on r.batch_id = b.id
   where b.status = 'processed' and b.source_kind = 'ENTRADA_NF'
     and trim(r.branch_code) = $1
`;

async function insertMonthlyFacts(client: Pick<PoolClient, "query">, versionId: string, rows: IndustryConsumptionMonthlyFact[]): Promise<void> {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const values: unknown[] = [];
    const placeholders = batch.map((row, index) => {
      const base = index * 5;
      values.push(versionId, row.branchCode, row.aggregateCode, row.period, row.consumptionValue);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    });
    await client.query(
      `insert into public.industry_consumption_monthly
         (version_id, branch_code, aggregate_code, period, consumption_value)
       values ${placeholders.join(", ")}`,
      values,
    );
  }
}

async function insertStockFacts(client: Pick<PoolClient, "query">, versionId: string, rows: IndustryStockMonthlyFact[]): Promise<void> {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const values: unknown[] = [];
    const placeholders = batch.map((row, index) => {
      const base = index * 6;
      values.push(versionId, row.branchCode, row.productCode, row.aggregateCode, row.period, row.stockValue);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    });
    await client.query(
      `insert into public.industry_stock_monthly
         (version_id, branch_code, product_code, aggregate_code, period, stock_value)
       values ${placeholders.join(", ")}`,
      values,
    );
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type RebuildIndustryConsumptionResult = {
  versionId: string;
  monthlyRows: number;
  stockRows: number;
  sourceRows: number;
  sourceFingerprint: string;
  beginPeriod: string;
  endPeriod: string;
};

export async function rebuildIndustryConsumption(pool: Pool): Promise<RebuildIndustryConsumptionResult> {
  const client = await pool.connect();
  const versionId = randomUUID();
  let transactionOpen = false;
  let lockHeld = false;
  let sourceRows = 0;
  let latestManifest: IndustrySourceManifestBatch[] = [];
  try {
    await client.query("SET lock_timeout = '5s'");
    await client.query("select pg_advisory_lock(hashtextextended($1, 0))", [ADVISORY_LOCK_KEY]);
    lockHeld = true;
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query("SET LOCAL lock_timeout = '5s'");

    latestManifest = await readRelevantManifest(client);
    const closings: IndustryClosingSourceRow[] = [];
    const entries: IndustryEntrySourceRow[] = [];
    await fetchCursorRows<IndustryClosingSourceRow>(client, "industry_consumption_closing_cursor", closingSourceSql, [INDUSTRY_BRANCH], async rows => {
      closings.push(...rows);
      sourceRows += rows.length;
      if (sourceRows && sourceRows % 10000 < rows.length) console.info(`[IndustryConsumption] ${sourceRows} source rows`);
    });
    await fetchCursorRows<IndustryEntrySourceRow>(client, "industry_consumption_entry_cursor", entrySourceSql, [INDUSTRY_BRANCH], async rows => {
      entries.push(...rows);
      sourceRows += rows.length;
      if (sourceRows && sourceRows % 10000 < rows.length) console.info(`[IndustryConsumption] ${sourceRows} source rows`);
    });

    const facts = buildIndustryConsumptionFacts(closings, entries);
    if (!latestManifest.some(batch => batch.sourceKind === "FECHAMENTO_ESTOQUE") || !latestManifest.some(batch => batch.sourceKind === "ENTRADA_NF")) {
      throw new Error("A base industrial exige lotes processados das duas fontes com linhas na filial 0105");
    }
    if (!facts.monthly.length) throw new Error("A base industrial não possui consumo calculável");
    const manifest = makeManifest(latestManifest, facts);
    const sourceFingerprint = industrySourceFingerprint(latestManifest);

    await client.query(
      `insert into public.industry_consumption_versions
         (id, status, source_fingerprint, source_manifest, source_rows, monthly_rows, stock_rows, min_period, max_period)
       values ($1, 'building', $2, $3::jsonb, $4, 0, 0, $5, $6)`,
      [versionId, sourceFingerprint, JSON.stringify(manifest), facts.sourceRows, facts.minPeriod, facts.maxPeriod],
    );
    await insertMonthlyFacts(client, versionId, facts.monthly);
    await insertStockFacts(client, versionId, facts.stock);
    await client.query(
      `update public.industry_consumption_versions
          set status = 'ready', monthly_rows = $2, stock_rows = $3, published_at = now()
        where id = $1`,
      [versionId, facts.monthly.length, facts.stock.length],
    );
    await client.query(
      `insert into public.industry_consumption_head (singleton, version_id)
       values (true, $1)
       on conflict (singleton) do update set version_id = excluded.version_id`,
      [versionId],
    );
    await client.query("COMMIT");
    transactionOpen = false;
    const result = {
      versionId,
      monthlyRows: facts.monthly.length,
      stockRows: facts.stock.length,
      sourceRows: facts.sourceRows,
      sourceFingerprint,
      beginPeriod: facts.minPeriod,
      endPeriod: facts.maxPeriod,
    };
    console.info(`[IndustryConsumption] ready version=${versionId} sourceRows=${result.sourceRows} monthlyRows=${result.monthlyRows} stockRows=${result.stockRows}`);
    return result;
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK").catch(() => undefined);
      transactionOpen = false;
    }
    try {
      await client.query(
        `insert into public.industry_consumption_versions
           (id, status, source_fingerprint, source_manifest, source_rows, error)
         values ($1, 'failed', $2, $3::jsonb, $4, $5)`,
        [versionId, industrySourceFingerprint(latestManifest), JSON.stringify({ batches: canonicalManifestBatches(latestManifest), sourceRows }), sourceRows, errorText(error)],
      );
      await client.query("COMMIT");
    } catch {
      // A failure record is best effort; the rollback above is the publication guarantee.
      await client.query("ROLLBACK").catch(() => undefined);
    }
    throw error;
  } finally {
    if (lockHeld) await client.query("select pg_advisory_unlock(hashtextextended($1, 0))", [ADVISORY_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

export type ReadIndustryConsumptionResult = {
  consumo: Map<string, number>;
  estoqueAgregado: Map<string, number>;
  versionId: string;
  refreshedAt: string;
  stale: boolean;
};

type HeadRow = {
  versionId: string;
  status: string;
  sourceFingerprint: string;
  publishedAt: string | Date | null;
};

function normalizePeriods(periods: string[]): string[] {
  const normalized = [...new Set(periods.map(period => text(period)))];
  for (const period of normalized) assertPeriod(period, "period");
  return normalized.sort();
}

function parseStoredNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  assertFinite(parsed, label);
  return parsed;
}

export async function readIndustryConsumption(
  pool: Pool,
  periods: string[],
  branch: string,
  productCodes: string[] | null = null,
): Promise<ReadIndustryConsumptionResult> {
  const selectedPeriods = normalizePeriods(periods);
  const selectedBranch = text(branch);
  if (!selectedBranch) throw new Error("filial industrial obrigatória");
  const codes = productCodes == null ? null : [...new Set(productCodes.map(text).filter(Boolean))].sort();
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionOpen = true;
    const head = await client.query<HeadRow>(
      `select h.version_id::text as "versionId", v.status,
              v.source_fingerprint as "sourceFingerprint", v.published_at as "publishedAt"
         from public.industry_consumption_head h
         left join public.industry_consumption_versions v on v.id = h.version_id
        where h.singleton = true`,
    );
    const current = head.rows[0];
    if (!current?.versionId || current.status !== "ready") throw new Error(BASE_NOT_PREPARED);
    if (!current.publishedAt) throw new Error(`${BASE_NOT_PREPARED}: versão sem publicação`);

    const consumo = new Map<string, number>();
    if (selectedPeriods.length) {
      const monthly = await client.query<{
        branchCode: string;
        aggregateCode: string;
        period: string;
        consumptionValue: string | number;
      }>(
        `select branch_code as "branchCode", aggregate_code as "aggregateCode", period,
                consumption_value::text as "consumptionValue"
           from public.industry_consumption_monthly
          where version_id = $1 and branch_code = $2 and period = any($3::text[])`,
        [current.versionId, selectedBranch, selectedPeriods],
      );
      for (const row of monthly.rows) {
        const value = parseStoredNumber(row.consumptionValue, "consumption_value");
        consumo.set(`${row.branchCode}|${row.aggregateCode}|${row.period}`, value);
      }
    }

    const latestByProduct = new Map<string, { period: string; aggregateCode: string; value: number }>();
    if (selectedPeriods.length) {
      const stock = await client.query<{
        branchCode: string;
        productCode: string;
        aggregateCode: string;
        period: string;
        stockValue: string | number;
      }>(
        `select branch_code as "branchCode", product_code as "productCode",
                aggregate_code as "aggregateCode", period, stock_value::text as "stockValue"
           from public.industry_stock_monthly
          where version_id = $1 and branch_code = $2 and period = any($3::text[])
            and ($4::text[] is null or product_code = any($4::text[]) or aggregate_code = any($4::text[]))`,
        [current.versionId, selectedBranch, selectedPeriods, codes],
      );
      for (const row of stock.rows) {
        const value = parseStoredNumber(row.stockValue, "stock_value");
        const previous = latestByProduct.get(row.productCode);
        if (!previous || row.period > previous.period) {
          latestByProduct.set(row.productCode, { period: row.period, aggregateCode: row.aggregateCode, value });
        }
      }
    }
    const estoqueAgregado = new Map<string, number>();
    for (const row of latestByProduct.values()) {
      const key = `${selectedBranch}|${row.aggregateCode}`;
      estoqueAgregado.set(key, (estoqueAgregado.get(key) ?? 0) + row.value);
    }

    const batches = await readRelevantManifest(client);
    const currentFingerprint = industrySourceFingerprint(batches);
    if (currentFingerprint !== current.sourceFingerprint) {
      const refreshedAt = current.publishedAt instanceof Date ? current.publishedAt.toISOString() : new Date(current.publishedAt).toISOString();
      throw new Error(`${BASE_OUTDATED}: fontes alteradas desde a publicação em ${refreshedAt}; execute rebuildIndustryConsumption (scripts/rebuildIndustryConsumption.ts) para reconstruir a base.`);
    }
    await client.query("COMMIT");
    transactionOpen = false;
    const refreshedAt = current.publishedAt instanceof Date ? current.publishedAt.toISOString() : new Date(current.publishedAt).toISOString();
    return { consumo, estoqueAgregado, versionId: current.versionId, refreshedAt, stale: false };
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
    if (code === "42P01") throw new Error(BASE_NOT_PREPARED);
    throw error;
  } finally {
    client.release();
  }
}
