import * as XLSX from "xlsx";

export type CostEvolutionSegment = "auto_parts" | "industry";

export type CostEvolutionObservation = {
  balanceDate: string;
  cost: number;
};

export type CostEvolutionRow = {
  sourceRow: number;
  branch: string;
  aggregateCode: string;
  code: string;
  mrp: "Sim" | "Não";
  description: string;
  buyer: string;
  lastPurchaseDate: string | null;
  lastPurchasePrice: number | null;
  observations: CostEvolutionObservation[];
};

export type CostEvolutionIssue = {
  row: number;
  field: string;
  message: string;
};

export type CostEvolutionPreview = {
  fileName: string;
  segment: CostEvolutionSegment;
  periodStart: string;
  periodEnd: string;
  dateColumns: string[];
  itemCount: number;
  observationCount: number;
  ignoredRowCount: number;
  normalizedTextCellCount: number;
  issues: CostEvolutionIssue[];
  sample: CostEvolutionRow[];
};

type ParsedWorkbook = CostEvolutionPreview & { rows: CostEvolutionRow[] };

const REQUIRED_HEADERS = ["FILIAL", "COD AGREGADO", "CODIGO", "ENTRA MRP", "DESCRIÇÃO", "COMPRADOR", "ULT.COMPRA", "ULT.PRECO"] as const;

export function normalizeRmBisText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: unknown) {
  return normalizeRmBisText(value).toUpperCase();
}

function parseDateHeader(value: unknown): string | null {
  const normalized = normalizeRmBisText(value).replace(/\D/g, "");
  if (!/^\d{8}$/.test(normalized)) return null;
  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(4, 6));
  const day = Number(normalized.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
}

function parseLastPurchaseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return parseDateHeader(value);
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = normalizeRmBisText(value);
  if (!normalized) return null;
  const candidate = normalized.includes(",") && !normalized.includes(".") ? normalized.replace(",", ".") : normalized;
  const number = Number(candidate);
  return Number.isFinite(number) ? number : null;
}

function normalizeMrp(value: unknown): "Sim" | "Não" | null {
  const normalized = normalizeHeader(value);
  if (["S", "SIM", "YES", "Y"].includes(normalized)) return "Sim";
  if (["N", "NÃO", "NAO", "NO"].includes(normalized)) return "Não";
  return null;
}

function countChangedText(values: unknown[]) {
  return values.reduce<number>((count, value) => {
    if (typeof value !== "string") return count;
    return count + (normalizeRmBisText(value) === value ? 0 : 1);
  }, 0);
}

export function parseCostEvolutionWorkbook(fileName: string, buffer: Buffer, segment: CostEvolutionSegment): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, dense: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("A planilha não contém nenhuma aba.");
  const worksheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, defval: null, blankrows: false });
  const headerIndex = matrix.findIndex(row => normalizeHeader(row[0]) === "FILIAL");
  if (headerIndex < 0) throw new Error("Não foi encontrada a linha de cabeçalho iniciada por FILIAL.");

  const headerRow = matrix[headerIndex] ?? [];
  const headers = headerRow.map(normalizeHeader);
  const headerIndexes = new Map<string, number>();
  headers.forEach((header, index) => { if (header && !headerIndexes.has(header)) headerIndexes.set(header, index); });
  const missing = REQUIRED_HEADERS.filter(header => !headerIndexes.has(header));
  if (missing.length) throw new Error(`Cabeçalhos obrigatórios ausentes: ${missing.join(", ")}.`);

  const dateColumns = headerRow
    .map((value, index) => ({ index, date: parseDateHeader(value) }))
    .filter((item): item is { index: number; date: string } => Boolean(item.date));
  const uniqueDateColumns = dateColumns.filter((item, index, all) => all.findIndex(candidate => candidate.date === item.date) === index);
  if (!uniqueDateColumns.length) throw new Error("Nenhuma coluna mensal no formato aaaaMMdd foi encontrada.");

  const issues: CostEvolutionIssue[] = [];
  const rows: CostEvolutionRow[] = [];
  let ignoredRowCount = 0;
  let normalizedTextCellCount = 0;
  const businessKeys = new Set<string>();

  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const source = matrix[index] ?? [];
    const sourceRow = index + 1;
    normalizedTextCellCount += countChangedText(source);
    const branch = normalizeRmBisText(source[headerIndexes.get("FILIAL")!]);
    if (!branch || normalizeHeader(branch) === "TOTAL GERAL") {
      ignoredRowCount += 1;
      continue;
    }
    const aggregateCode = normalizeRmBisText(source[headerIndexes.get("COD AGREGADO")!]);
    const code = normalizeRmBisText(source[headerIndexes.get("CODIGO")!]);
    const description = normalizeRmBisText(source[headerIndexes.get("DESCRIÇÃO")!]);
    const buyer = normalizeRmBisText(source[headerIndexes.get("COMPRADOR")!]);
    const mrp = normalizeMrp(source[headerIndexes.get("ENTRA MRP")!]);
    let valid = true;
    if (!aggregateCode) { issues.push({ row: sourceRow, field: "COD AGREGADO", message: "Código agregado obrigatório." }); valid = false; }
    if (!code) { issues.push({ row: sourceRow, field: "CODIGO", message: "Código obrigatório." }); valid = false; }
    if (!description) { issues.push({ row: sourceRow, field: "DESCRIÇÃO", message: "Descrição obrigatória." }); valid = false; }
    if (!mrp) { issues.push({ row: sourceRow, field: "ENTRA MRP", message: "Use S/Sim ou N/Não." }); valid = false; }
    const key = `${branch}\u0000${aggregateCode}\u0000${code}`;
    if (businessKeys.has(key)) { issues.push({ row: sourceRow, field: "CODIGO", message: "Chave FILIAL + COD AGREGADO + CODIGO duplicada." }); valid = false; }
    if (!valid || !mrp) continue;
    businessKeys.add(key);
    const observations = uniqueDateColumns.flatMap(column => {
      const cost = parseNumber(source[column.index]);
      return cost === null ? [] : [{ balanceDate: column.date, cost }];
    });
    rows.push({
      sourceRow,
      branch,
      aggregateCode,
      code,
      mrp,
      description,
      buyer,
      lastPurchaseDate: parseLastPurchaseDate(source[headerIndexes.get("ULT.COMPRA")!]),
      lastPurchasePrice: parseNumber(source[headerIndexes.get("ULT.PRECO")!]),
      observations,
    });
  }

  const dates = uniqueDateColumns.map(item => item.date).sort();
  const observationCount = rows.reduce((sum, row) => sum + row.observations.length, 0);
  return {
    fileName,
    segment,
    periodStart: dates[0],
    periodEnd: dates.at(-1)!,
    dateColumns: dates,
    itemCount: rows.length,
    observationCount,
    ignoredRowCount,
    normalizedTextCellCount,
    issues,
    sample: rows.slice(0, 20),
    rows,
  };
}

export function previewCostEvolutionWorkbook(fileName: string, buffer: Buffer, segment: CostEvolutionSegment): CostEvolutionPreview {
  const { rows: _rows, ...preview } = parseCostEvolutionWorkbook(fileName, buffer, segment);
  return preview;
}