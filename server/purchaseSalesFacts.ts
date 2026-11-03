import {
  costSalesCodeAliases,
  normalizeCostSalesBranch,
  normalizeCostSalesPeriod,
  parseCostSalesQuantity,
} from "./costSalesHistory";

export type PurchaseSalesSourceRow = {
  sourceImportId: number;
  sourceRowId: number;
  sourceImportedAt: string | Date;
  branch: unknown;
  code: unknown;
  codeOriginal?: unknown;
  salesMonths: unknown;
};

export type PurchaseSalesMonthlyFact = {
  branchCode: string;
  code: string;
  period: string;
  quantity: number;
  sourceImportId: number;
  sourceRowId: number;
  sourceImportedAt: Date;
};

function parseImportedAt(value: string | Date, importId: number, rowId: number): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Data importedAt inválida na carga ${importId}, linha ${rowId}.`);
  }
  return date;
}

function factKey(fact: Pick<PurchaseSalesMonthlyFact, "branchCode" | "code" | "period">): string {
  return `${fact.branchCode}|${fact.code}|${fact.period}`;
}

function newer(candidate: PurchaseSalesMonthlyFact, current: PurchaseSalesMonthlyFact): boolean {
  return candidate.sourceImportedAt.getTime() > current.sourceImportedAt.getTime() ||
    (candidate.sourceImportedAt.getTime() === current.sourceImportedAt.getTime() &&
      candidate.sourceImportId > current.sourceImportId);
}

/**
 * Transforma linhas ordenadas por importId e id da linha em fatos mensais.
 * Mantém aliases, zeros, sufixos e duplicidades como costSalesHistory.
 */
export async function* materializePurchaseSalesFacts(
  rows: AsyncIterable<PurchaseSalesSourceRow> | Iterable<PurchaseSalesSourceRow>,
): AsyncGenerator<PurchaseSalesMonthlyFact> {
  let currentImportId: number | null = null;
  let lastImportId = 0;
  let lastRowId = 0;
  let seenInImport = new Map<string, number>();

  for await (const row of rows) {
    if (!Number.isSafeInteger(row.sourceImportId) || row.sourceImportId < 1) {
      throw new Error(`importId inválido na linha ${row.sourceRowId}.`);
    }
    if (!Number.isSafeInteger(row.sourceRowId) || row.sourceRowId < 1) {
      throw new Error(`id de linha inválido na carga ${row.sourceImportId}.`);
    }
    if (row.sourceImportId < lastImportId ||
      (row.sourceImportId === currentImportId && row.sourceRowId < lastRowId)) {
      throw new Error("As linhas de origem precisam estar ordenadas por importId e id da linha.");
    }
    if (row.sourceImportId !== currentImportId) {
      currentImportId = row.sourceImportId;
      lastImportId = row.sourceImportId;
      seenInImport = new Map();
    }
    lastRowId = row.sourceRowId;

    const branchCode = normalizeCostSalesBranch(row.branch);
    const aliases = costSalesCodeAliases(row.code, row.codeOriginal);
    if (!branchCode || aliases.length === 0 || !row.salesMonths || typeof row.salesMonths !== "object" || Array.isArray(row.salesMonths)) continue;

    const sourceImportedAt = parseImportedAt(row.sourceImportedAt, row.sourceImportId, row.sourceRowId);
    for (const [rawPeriod, rawQuantity] of Object.entries(row.salesMonths as Record<string, unknown>)) {
      const period = normalizeCostSalesPeriod(rawPeriod);
      const quantity = parseCostSalesQuantity(rawQuantity);
      if (!period || quantity == null) continue;

      for (const code of aliases) {
        const fact: PurchaseSalesMonthlyFact = {
          branchCode,
          code,
          period,
          quantity,
          sourceImportId: row.sourceImportId,
          sourceRowId: row.sourceRowId,
          sourceImportedAt,
        };
        const key = factKey(fact);
        const previous = seenInImport.get(key);
        if (previous != null) {
          if (previous !== quantity) {
            throw new Error(
              `Duplicidade conflitante na mesma carga: importId ${row.sourceImportId}, chave ${branchCode}|${code}, período ${period}; valores ${previous} e ${quantity}.`,
            );
          }
          continue;
        }
        seenInImport.set(key, quantity);
        yield fact;
      }
    }
  }
}

/** Resolve todas as cargas aprovadas para um snapshot corrente por chave e mês. */
export async function buildPurchaseSalesFactSnapshot(
  rows: AsyncIterable<PurchaseSalesSourceRow> | Iterable<PurchaseSalesSourceRow>,
): Promise<Map<string, PurchaseSalesMonthlyFact>> {
  const snapshot = new Map<string, PurchaseSalesMonthlyFact>();
  for await (const fact of materializePurchaseSalesFacts(rows)) {
    const key = factKey(fact);
    const current = snapshot.get(key);
    if (!current || newer(fact, current)) snapshot.set(key, fact);
  }
  return snapshot;
}
