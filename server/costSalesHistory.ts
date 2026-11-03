export type CostSalesHistoryRow = {
  branch: string;
  code: string;
  codeOriginal?: string | null;
  salesMonths?: Record<string, unknown> | null;
  importedAt: string | Date;
  importId: number;
  rowId?: number;
};

/** Índice plano: filial normalizada | código (ou alias) | período YYYYMM. */
export type CostSalesHistoryIndex = Map<string, number>;

export type CostSalesMonthlyFactRow = {
  branchCode: string;
  code: string;
  period: string;
  quantity: number;
};

const MONTH_NAMES: Record<string, string> = {
  jan: "01",
  janeiro: "01",
  feb: "02",
  fevereiro: "02",
  fev: "02",
  mar: "03",
  marco: "03",
  março: "03",
  abr: "04",
  abril: "04",
  apr: "04",
  mai: "05",
  maio: "05",
  may: "05",
  jun: "06",
  junho: "06",
  jul: "07",
  julho: "07",
  ago: "08",
  agosto: "08",
  aug: "08",
  set: "09",
  setembro: "09",
  sep: "09",
  out: "10",
  outubro: "10",
  oct: "10",
  nov: "11",
  novembro: "11",
  dec: "12",
  dez: "12",
  dezembro: "12",
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function validPeriod(year: string, month: string): string | null {
  const monthNumber = Number(month);
  if (!/^\d{4}$/.test(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return null;
  return `${year}${String(monthNumber).padStart(2, "0")}`;
}

/** Normaliza filial para quatro dígitos quando a origem traz um código numérico. */
export function normalizeCostSalesBranch(value: unknown): string {
  const raw = text(value);
  const digits = raw.match(/^\d{1,4}/)?.[0];
  return digits ? digits.padStart(4, "0") : raw;
}

/**
 * Normaliza somente zeros iniciais do trecho numérico do código.
 * Sufixos como -MGT, _MGT ou letras após o número são preservados.
 */
export function normalizeCostSalesCode(value: unknown): string {
  const raw = text(value);
  return raw.replace(/^0+(?=\d)/, "");
}

/** Retorna o código literal e sua forma histórica sem zeros iniciais, sem remover sufixos. */
export function costSalesCodeAliases(code: unknown, codeOriginal?: unknown): string[] {
  const aliases = new Set<string>();
  for (const value of [code, codeOriginal]) {
    const raw = text(value);
    if (!raw) continue;
    aliases.add(raw);
    aliases.add(normalizeCostSalesCode(raw));
  }
  return [...aliases];
}

/** Aceita YYYYMM, YYYY-MM, MM/YYYY e nomes de mês em português (por exemplo, Abr/2026). */
export function normalizeCostSalesPeriod(value: unknown): string | null {
  const raw = text(value);
  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  if (/^\d{6}$/.test(normalized)) return validPeriod(normalized.slice(0, 4), normalized.slice(4));

  const numeric = normalized.match(/^(\d{4})\s*[-/]\s*(\d{1,2})$/) ?? normalized.match(/^(\d{1,2})\s*[-/]\s*(\d{4})$/);
  if (numeric) {
    const year = numeric[1].length === 4 ? numeric[1] : numeric[2];
    const month = numeric[1].length === 4 ? numeric[2] : numeric[1];
    return validPeriod(year, month);
  }

  const named = normalized.match(/^([a-z]+)\s*(?:[-/]\s*|\s+)(\d{4})$/) ?? normalized.match(/^(\d{4})\s*(?:[-/]\s*|\s+)([a-z]+)$/);
  if (!named) return null;
  const year = named[1].length === 4 ? named[1] : named[2];
  const monthName = named[1].length === 4 ? named[2] : named[1];
  const month = MONTH_NAMES[monthName];
  return month ? validPeriod(year, month) : null;
}

export function parseCostSalesQuantity(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const normalized = raw.includes(",") && !raw.includes(".") ? raw.replace(",", ".") : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function importedAtTime(value: string | Date, row: CostSalesHistoryRow): number {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(time)) {
    throw new Error(`Data importedAt inválida na carga ${row.importId}${row.rowId == null ? "" : `, linha ${row.rowId}`}.`);
  }
  return time;
}

function indexKey(branch: string, code: string, period: string): string {
  return `${branch}|${code}|${period}`;
}

type Candidate = {
  branch: string;
  code: string;
  period: string;
  value: number;
  importedAt: number;
  importId: number;
  rowId?: number;
};

function isNewer(candidate: Candidate, current: Candidate): boolean {
  return candidate.importedAt > current.importedAt ||
    (candidate.importedAt === current.importedAt && candidate.importId > current.importId);
}

/**
 * Constrói o histórico por mês a partir das linhas das cargas aprovadas fornecidas.
 * Uma ausência/valor inválido em carga nova não remove o valor válido de carga anterior.
 */
export function buildCostSalesHistoryIndex(rows: CostSalesHistoryRow[]): CostSalesHistoryIndex {
  const index: CostSalesHistoryIndex = new Map();
  const selected = new Map<string, Candidate>();
  const sameImport = new Map<string, Candidate>();
  let currentImport: number | null = null;

  // Agrupar por carga mantém a auditoria de duplicidades sem reter todas as
  // combinações das cargas históricas simultaneamente na VM de pouca memória.
  for (const row of [...rows].sort((a, b) => a.importId - b.importId)) {
    if (!Number.isFinite(row.importId)) {
      throw new Error(`importId inválido${row.rowId == null ? "" : ` na linha ${row.rowId}`}.`);
    }
    if (currentImport !== row.importId) {
      sameImport.clear();
      currentImport = row.importId;
    }
    const branch = normalizeCostSalesBranch(row.branch);
    const aliases = costSalesCodeAliases(row.code, row.codeOriginal);
    if (!branch || aliases.length === 0 || !row.salesMonths) continue;
    const importedAt = importedAtTime(row.importedAt, row);

    for (const [rawPeriod, rawValue] of Object.entries(row.salesMonths)) {
      const period = normalizeCostSalesPeriod(rawPeriod);
      const value = parseCostSalesQuantity(rawValue);
      if (!period || value == null) continue;

      for (const code of aliases) {
        const key = indexKey(branch, code, period);
        const candidate: Candidate = { branch, code, period, value, importedAt, importId: row.importId, rowId: row.rowId };
        const loadKey = `${row.importId}|${key}`;
        const duplicate = sameImport.get(loadKey);
        if (duplicate) {
          if (duplicate.value !== candidate.value) {
            throw new Error(
              `Duplicidade conflitante na mesma carga: importId ${row.importId}, chave ${branch}|${code}, período ${period}; valores ${duplicate.value} e ${candidate.value}.`,
            );
          }
          continue;
        }
        sameImport.set(loadKey, candidate);

        const current = selected.get(key);
        if (!current || isNewer(candidate, current)) selected.set(key, candidate);
      }
    }
  }

  for (const [key, candidate] of selected) index.set(key, candidate.value);
  return index;
}

/** Indexa fatos mensais já deduplicados e versionados, preservando zero como valor válido. */
export function buildCostSalesHistoryIndexFromFacts(rows: CostSalesMonthlyFactRow[]): CostSalesHistoryIndex {
  const index: CostSalesHistoryIndex = new Map();
  for (const row of rows) {
    const branch = normalizeCostSalesBranch(row.branchCode);
    const period = normalizeCostSalesPeriod(row.period);
    if (!branch || !period || !Number.isFinite(row.quantity)) continue;
    for (const code of costSalesCodeAliases(row.code)) {
      index.set(indexKey(branch, code, period), row.quantity);
    }
  }
  return index;
}

/** Consulta uma quantidade usando código literal, codeOriginal ou alias histórico sem zeros iniciais. */
export function getCostSalesHistoryQuantity(
  index: CostSalesHistoryIndex,
  branch: unknown,
  code: unknown,
  period: unknown,
): number | null {
  const normalizedBranch = normalizeCostSalesBranch(branch);
  const normalizedPeriod = normalizeCostSalesPeriod(period);
  if (!normalizedBranch || !normalizedPeriod) return null;

  for (const alias of costSalesCodeAliases(code)) {
    const key = indexKey(normalizedBranch, alias, normalizedPeriod);
    if (index.has(key)) return index.get(key)!;
  }
  return null;
}

/** Alias curto para consumidores que preferem tratar o índice como lookup mensal. */
export const getCostSalesHistory = getCostSalesHistoryQuantity;
