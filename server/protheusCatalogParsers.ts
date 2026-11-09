/**
 * protheusCatalogParsers.ts
 * Parsers dos cadastros Protheus (SB1, SBZ, SB5, SA2) para a prévia e a importação.
 * Módulo: server (API tRPC)
 *
 * // REGRA DE NEGÓCIO — EXPORTAÇÃO DOS ARQUIVOS (lembrete permanente — 24/09/2026):
 * //   - Compras:   cabeçalho SEMPRE na linha 1.
 * //   - SB1/SBZ (e demais cadastros): cabeçalho SEMPRE na linha 2, a partir de 24/09/2026.
 * //   - A ferramenta procura o cabeçalho nas linhas 1, 2, 3 e 4 (e além), comparando os
 * //     rótulos normalizados (sem acento/símbolos). Exportações com título ou linha de
 * //     observação antes do cabeçalho continuam funcionando.
 * //   - Colunas obrigatórias: SB1 = Código, Cod Agregado, Descrição;
 * //     SBZ = Filial, Código, Entra MRP; SB5 = Produto, Marca Peça; SA2 = Código, Loja, Razão Social.
 * //   - Decodificação automática UTF-8 e Windows-1252 (escolhe a que encontrar o cabeçalho).
 * // REGRA DE NEGÓCIO — NORMALIZAÇÃO (vale para TODO o portal, todas as sessões):
 * //   - Campos de código/filial são capturados COMO TEXTO, preservando zeros à esquerda
 * //     e o valor original (nada de 0101 virar 101 ou 0001 virar 1 na captura).
 * //   - A normalização para cruzamento é aplicada SOMENTE depois, por funções únicas:
 * //     código sem zero à esquerda preservando sufixo (0000000001 → 1) e filial com 4
 * //     dígitos (0101-MEGATEC ARACATUBA → 0101). O mesmo padrão vale no Compras × SB1/SBZ,
 * //     no re-enriquecimento, no Recebimento e em qualquer módulo futuro.
 * // MUDANÇA (24/09/2026): a leitura agora DETECTA arquivos .xlsx (assinatura interna do
 * //   Excel) e lê as células de verdade com o leitor XLSX já usado na Compras. O usuário
 * //   exporta do Protheus e importa direto, sem converter para CSV. Arquivos CSV/texto
 * //   continuam funcionando (fallback automático).
 * // CORREÇÃO (09/11/2026): mapHeaders mantém a PRIMEIRA ocorrência de colunas duplicadas
 * //   (o SB1 traz 'Familia' duas vezes — a primeira com o código real, a segunda vazia;
 * //   o Map guardava a última e o parser lia a vazia — causa raiz do familiaCode vazio).
 */
import * as XLSX from "xlsx";
import { cleanSourceText, normalizeBranchCode, normalizeProductCode, normalizeSupplierKey, parseSourceNumber } from "./operationalNormalization";

export type RegistrationIssue = { row: number; field: string; message: string };
export type RegistrationResult<T> = { rows: T[]; sourceRows: number; skippedRows: number; duplicateRows: number; issues: RegistrationIssue[] };
type CsvRow = string[];

function normalizeHeader(value: unknown) {
  return cleanSourceText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
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

function emptyResult<T>(): RegistrationResult<T> {
  return { rows: [], sourceRows: 0, skippedRows: 0, duplicateRows: 0, issues: [] };
}

function invalidScientific(value: string) {
  return /^\s*[+-]?\d+(\.\d+)?[eE][+-]?\d+\s*$/.test(value);
}

const SB1_HEADER = [["codigo", "cod"], ["codagregado", "codagreg", "codigodoagregado"], ["descricao", "desc", "descricaodoproduto"]];
const SBZ_HEADER = [["filial", "codigofilial", "fil"], ["codigo", "cod", "produto"], ["entramrp", "mrp", "entranomrp"]];
const SB5_HEADER = [["produto", "codigo", "cod"], ["marcapeca", "marcadapeca"]];
const SA2_HEADER = [["codigo", "cod"], ["loja", "filial", "store"], ["razaosocial", "nome", "fornecedor"]];

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

const ZFM_HEADER = [["codigo", "cod", "codfamilia", "familia"], ["descricao", "desc", "descricaofamilia", "descricaodafamilia"]];
const ZSF_HEADER = [["codigo", "cod", "codsubfamilia", "subfamilia"], ["descricao", "desc", "descricaosubfamilia", "descricaodasubfamilia"]];

export function parseZfm(content: Buffer | string): RegistrationResult<FamilyCatalogRow> {
  return parseFamilyCatalog(content, "FAMILIA", ZFM_HEADER);
}

export function parseZsf(content: Buffer | string): RegistrationResult<FamilyCatalogRow> {
  return parseFamilyCatalog(content, "SUBFAMILIA", ZSF_HEADER);
}
