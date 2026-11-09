// ============================================================
// protheusCatalogParsers.ts — parsers dos CSVs de catálogo Protheus
// (SB1, SBZ, SB5, SA2, ZFM, ZSF) lidos direto do OneDrive.
// ============================================================
import { cleanSourceText, normalizeBranchCode, normalizeProductCode, normalizeSupplierKey, parseSourceNumber } from "./operationalNormalization";

function normalizeHeader(value: unknown) {
  return cleanSourceText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function parseCsv(content: string) {
  const first = content.split(/\r?\n/).find(line => line.includes(";") || line.includes(",")) ?? "";
  const delimiter = first.split(";").length >= first.split(",").length ? ";" : ",";
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const c = content[i];
    const n = content[i + 1];
    if (c === '"' && quoted && n === '"') { value += '"'; i += 1; continue; }
    if (c === '"') { quoted = !quoted; continue; }
    if (c === delimiter && !quoted) { row.push(value); value = ""; continue; }
    if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && n === "\n") i += 1;
      row.push(value);
      if (row.some(v => cleanSourceText(v) !== "")) rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += c;
  }
  if (row.some(v => cleanSourceText(v) !== "")) rows.push(row);
  return { rows, delimiter };
}

function readRowsWithHeader(content: Buffer | string, requiredHeaders: string[][]) {
  const text = typeof content === "string" ? content : content.toString("utf8");
  const { rows } = parseCsv(text);
  const headerIndex = rows.findIndex(row => {
    const normalized = row.map(normalizeHeader);
    return requiredHeaders.every(required => required.some(alias => normalized.includes(normalizeHeader(alias))));
  });
  return { rows, header: headerIndex };
}

function mapHeaders(header: CsvRow) {
  // REGRA (09/11/2026): o export do Protheus pode ter colunas DUPLICADAS
  // (o SB1 traz 'Familia' duas vezes — a primeira com o código real, a
  // segunda vazia). O Map guardava a ÚLTIMA ocorrência e o parser lia a
  // coluna vazia. Mantém a PRIMEIRA ocorrência de cada nome.
  const map = new Map<string, number>();
  header.forEach((value, index) => {
    const key = normalizeHeader(value);
    if (!map.has(key)) map.set(key, index);
  });
  return map;
}

function get(row: CsvRow, map: Map<string, number>, ...aliases: string[]) {
  for (const alias of aliases) {
    const index = map.get(normalizeHeader(alias));
    if (index !== undefined) return cleanSourceText(row[index]);
  }
  return "";
}

function getPreservingInternalSpaces(row: CsvRow, map: Map<string, number>, ...aliases: string[]) {
  for (const alias of aliases) {
    const index = map.get(normalizeHeader(alias));
    if (index !== undefined) return cleanSourceText(row[index]);
  }
  return "";
}

type CsvRow = string[];

export interface RegistrationResult<T> {
  rows: T[];
  sourceRows: number;
  skippedRows: number;
  duplicateRows: number;
  issues: Array<{ row: number; field: string; message: string }>;
  warnings: string[];
}

function emptyResult<T>(): RegistrationResult<T> {
  return { rows: [], sourceRows: 0, skippedRows: 0, duplicateRows: 0, issues: [], warnings: [] };
}

function invalidScientific(value: string) {
  return /^\s*[+-]?\d+(\.\d+)?[eE][+-]?\d+\s*$/.test(value);
}

const SB1_HEADER = [["codigo", "cod"], ["codagregado", "codagreg", "codigodoagregado"], ["descricao", "desc", "descricaodoproduto"]];
const SBZ_HEADER = [["filial", "codigofilial", "fil"], ["codigo", "cod", "produto"], ["entramrp", "mrp", "entranomrp"]];
const SB5_HEADER = [["produto", "codigo", "cod"], ["marcapeca", "marcadapeca"]];
const SA2_HEADER = [["codigo", "cod"], ["loja", "filial", "store"], ["razaosocial", "nome", "fornecedor"]];
const ZFM_HEADER = [["codigo", "cod", "codfamilia", "familia"], ["descricao", "desc", "descricaofamilia", "descricaodafamilia"]];
const ZSF_HEADER = [["codigo", "cod", "codsubfamilia", "subfamilia"], ["descricao", "desc", "descricaosubfamilia", "descricaodasubfamilia"]];

export interface Sb1CatalogRow {
  productCode: string;
  normalizedProductCode: string;
  aggregateProductCode: string;
  normalizedAggregateProductCode: string;
  description: string;
  type: string;
  family: string;
  subfamily: string;
  ncm: string;
  inclusionDate: string;
}

export function parseSb1(content: Buffer | string): RegistrationResult<Sb1CatalogRow> {
  const { rows, header } = readRowsWithHeader(content, SB1_HEADER);
  if (header < 0) throw new Error("SB1: cabeçalho não encontrado. Esperadas as colunas Código, Cod Agregado e Descrição (o cabeçalho pode estar nas linhas 1 a 4).");
  const map = mapHeaders(rows[header]);
  const out = emptyResult<Sb1CatalogRow>();
  const seen = new Map<string, number>();
  rows.slice(header + 1).forEach((row, offset) => {
    if (!row.some(v => cleanSourceText(v))) return;
    out.sourceRows += 1;
    const rawCode = get(row, map, "Codigo"), rawAggregate = get(row, map, "Cod Agregado"), code = cleanSourceText(rawCode), aggregate = cleanSourceText(rawAggregate);
    if (!code || invalidScientific(rawCode) || invalidScientific(rawAggregate)) {
      out.skippedRows += 1;
      out.issues.push({ row: header + offset + 2, field: "Codigo", message: "Código vazio ou em notação científica; reextração necessária." });
      return;
    }
    const current = {
      productCode: code,
      normalizedProductCode: normalizeProductCode(code),
      aggregateProductCode: aggregate,
      normalizedAggregateProductCode: normalizeProductCode(aggregate),
      description: get(row, map, "Descricao"),
      type: get(row, map, "Tipo"),
      family: get(row, map, "Familia"),
      subfamily: get(row, map, "Sub-familia"),
      ncm: get(row, map, "Pos.IPI/NCM"),
      inclusionDate: get(row, map, "Dt Inclusao"),
    };
    const previous = seen.get(code);
    if (previous !== undefined) {
      out.duplicateRows += 1;
      if (current.aggregateProductCode && !out.rows[previous].aggregateProductCode) out.rows[previous] = current;
      return;
    }
    seen.set(code, out.rows.length);
    out.rows.push(current);
  });
  return out;
}

export interface SbzCatalogRow {
  branch: string;
  normalizedBranch: string;
  productCode: string;
  normalizedProductCode: string;
  entersMrp: string;
}

export function parseSbz(content: Buffer | string): RegistrationResult<SbzCatalogRow> {
  const { rows, header } = readRowsWithHeader(content, SBZ_HEADER);
  if (header < 0) throw new Error("SBZ: cabeçalho não encontrado. Esperadas as colunas Filial, Código e Entra MRP.");
  const map = mapHeaders(rows[header]);
  const out = emptyResult<SbzCatalogRow>();
  const seen = new Set<string>();
  rows.slice(header + 1).forEach((row, offset) => {
    if (!row.some(v => cleanSourceText(v))) return;
    out.sourceRows += 1;
    const branch = get(row, map, "Filial");
    const productCode = get(row, map, "Codigo");
    if (!branch || !productCode) {
      out.skippedRows += 1;
      out.issues.push({ row: header + offset + 2, field: "Filial/Codigo", message: "Linha sem filial ou código de produto." });
      return;
    }
    const key = `${branch}|${productCode}`;
    if (seen.has(key)) { out.duplicateRows += 1; return; }
    seen.add(key);
    out.rows.push({
      branch,
      normalizedBranch: normalizeBranchCode(branch),
      productCode,
      normalizedProductCode: normalizeProductCode(productCode),
      entersMrp: get(row, map, "Entra MRP"),
    });
  });
  return out;
}

export interface Sb5CatalogRow {
  productCode: string;
  normalizedProductCode: string;
  marcaPeca: string;
}

export function parseSb5(content: Buffer | string): RegistrationResult<Sb5CatalogRow> {
  const { rows, header } = readRowsWithHeader(content, SB5_HEADER);
  if (header < 0) throw new Error("SB5: cabeçalho não encontrado. Esperadas as colunas Produto e Marca Peça.");
  const map = mapHeaders(rows[header]);
  const out = emptyResult<Sb5CatalogRow>();
  const seen = new Set<string>();
  rows.slice(header + 1).forEach((row, offset) => {
    if (!row.some(v => cleanSourceText(v))) return;
    out.sourceRows += 1;
    const productCode = get(row, map, "Produto");
    if (!productCode) {
      out.skippedRows += 1;
      out.issues.push({ row: header + offset + 2, field: "Produto", message: "Linha sem código de produto." });
      return;
    }
    if (seen.has(productCode)) { out.duplicateRows += 1; return; }
    seen.add(productCode);
    out.rows.push({
      productCode,
      normalizedProductCode: normalizeProductCode(productCode),
      marcaPeca: get(row, map, "Marca Peca"),
    });
  });
  return out;
}

export interface Sa2CatalogRow {
  supplierCode: string;
  store: string;
  normalizedName: string;
  supplierKey: string;
  cnpj: string;
  name: string;
}

export function parseSa2(content: Buffer | string): RegistrationResult<Sa2CatalogRow> {
  const { rows, header } = readRowsWithHeader(content, SA2_HEADER);
  if (header < 0) throw new Error("SA2: cabeçalho não encontrado. Esperadas as colunas Código, Loja e Razão Social.");
  const map = mapHeaders(rows[header]);
  const out = emptyResult<Sa2CatalogRow>();
  const seen = new Set<string>();
  rows.slice(header + 1).forEach((row, offset) => {
    if (!row.some(v => cleanSourceText(v))) return;
    out.sourceRows += 1;
    const supplierCode = get(row, map, "Codigo");
    const store = get(row, map, "Loja");
    if (!supplierCode || !store) {
      out.skippedRows += 1;
      out.issues.push({ row: header + offset + 2, field: "Codigo/Loja", message: "Linha sem código ou loja do fornecedor." });
      return;
    }
    const key = `${supplierCode}|${store}`;
    if (seen.has(key)) { out.duplicateRows += 1; return; }
    seen.add(key);
    out.rows.push({
      supplierCode,
      store,
      normalizedName: normalizeProductCode(get(row, map, "Razao Social")),
      supplierKey: normalizeSupplierKey(supplierCode, store),
      cnpj: get(row, map, "CNPJ/CPF"),
      name: get(row, map, "Razao Social"),
    });
  });
  return out;
}

export interface FamilyCatalogRow {
  kind: "FAMILIA" | "SUBFAMILIA";
  code: string;
  description: string;
}

function parseFamilyCatalog(content: Buffer | string, kind: "FAMILIA" | "SUBFAMILIA", required: string[][]): RegistrationResult<FamilyCatalogRow> {
  const { rows, header } = readRowsWithHeader(content, required);
  if (header < 0) throw new Error(`${kind}: cabeçalho não encontrado. Esperadas as colunas Código e Descrição (o cabeçalho pode estar nas linhas 1 a 4).`);
  const map = mapHeaders(rows[header]);
  const out = emptyResult<FamilyCatalogRow>();
  const seen = new Set<string>();
  rows.slice(header + 1).forEach((row, offset) => {
    if (!row.some(v => cleanSourceText(v))) return;
    out.sourceRows += 1;
    const code = get(row, map, "Codigo");
    const description = get(row, map, "Descricao");
    if (!code) {
      out.skippedRows += 1;
      out.issues.push({ row: header + offset + 2, field: "Codigo", message: "Linha sem código." });
      return;
    }
    if (seen.has(code)) { out.duplicateRows += 1; return; }
    seen.add(code);
    out.rows.push({ kind, code, description });
  });
  return out;
}

export function parseZfm(content: Buffer | string): RegistrationResult<FamilyCatalogRow> {
  return parseFamilyCatalog(content, "FAMILIA", ZFM_HEADER);
}

export function parseZsf(content: Buffer | string): RegistrationResult<FamilyCatalogRow> {
  return parseFamilyCatalog(content, "SUBFAMILIA", ZSF_HEADER);
}
