// ============================================================
// server/referenceImporters.ts
// Importa cadastros de referência (SB1, SBZ, Famílias, SubFamílias).
// Módulo: Compras e análise Protheus.
// MUDANÇA (07/09/2026): ignora cabeçalhos repetidos do Browse (aplicado às
// quatro importações via readRows) e normaliza a filial da SBZ para 4 dígitos.
// MUDANÇA (07/09/2026): cruzamento conforme as fórmulas originais da Compras:
//   - Compras.Codigo é a chave de cruzamento;
//   - casa com o SB1 pelo "Cod Agregado" OU pelo "Codigo" (fórmula original
//     =SEERRO(PROCV(A2;SB1!A:C;3;0);PROCV(A2;SB1!B:C;2;0)));
//   - SBZ indexado por Chave = Codigo + Filial (fórmula =B2&A2);
//   - todos os códigos normalizados (zeros à esquerda removidos).
// ============================================================
import * as XLSX from "xlsx";

// Normaliza um texto: minúsculas, sem acentos, sem espaços/símbolos.
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Normaliza um código para texto consistente, removendo espaços e zeros à
// esquerda da parte numérica, preservando sufixos ("00004" -> "4").
function normalizeCode(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const match = text.match(/^0+([0-9].*)$/);
  return match ? match[1] : text;
}

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = asText(value).replace(/[R$\s]/g, "");
  if (!text) return null;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  const normalized = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

// Extrai o código da filial (4 primeiros dígitos) de valores concatenados
// como "0307-MEGATEC CHAPADAC" ou "0101-MEGATEC ARACATUBA".
function branchCode(value: unknown): string {
  const text = asText(value);
  const match = text.match(/^(\d{4})/);
  return match ? match[1] : text;
}

// Padroniza o valor de "Entra MRP" para "Sim"/"Não" (o Browse exporta "Nao").
function mrpValue(value: unknown): string {
  const lower = asText(value).toLowerCase();
  if (!lower) return "";
  if (lower.startsWith("s")) return "Sim";
  if (lower.startsWith("n")) return "Não";
  return asText(value);
}

// Localiza a linha do cabeçalho procurando as colunas obrigatórias nas
// primeiras linhas da planilha.
function findHeaderRow(rows: unknown[][], requiredNormalized: string[]): number {
  for (let i = 0; i < rows.length && i < 60; i++) {
    const row = rows[i];
    if (!row) continue;
    const names = row.map((h) => normalize(asText(h)));
    const found = requiredNormalized.filter((r) => names.includes(r));
    if (found.length >= Math.min(2, requiredNormalized.length)) return i;
  }
  return -1;
}

// Lê as linhas de dados a partir do cabeçalho detectado, ignorando os
// cabeçalhos repetidos que o Browse insere a cada bloco/página e alinhando
// pelo deslocamento quando a linha não traz os metadados do 1º cabeçalho.
function readRows(buffer: Buffer, requiredColumns: string[]): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellText: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("A planilha de referência não possui uma aba.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: "",
  });
  const requiredNorm = requiredColumns.map(normalize);
  const headerIndex = findHeaderRow(rows, requiredNorm);
  if (headerIndex < 0)
    throw new Error(`Não foi possível localizar o cabeçalho com as colunas: ${requiredColumns.join(", ")}.`);
  const headers = rows[headerIndex].map((h) => normalize(asText(h)));
  const firstRequiredPos = headers.findIndex((h) => requiredNorm.includes(h));
  // Uma linha é "cabeçalho repetido" quando contém, como célula, o rótulo de
  // alguma coluna obrigatória (ex.: célula "Codigo" ou "Filial").
  const isHeaderLike = (row: unknown[]) =>
    row.some((cell) => requiredNorm.includes(normalize(asText(cell))));
  const result: Record<string, unknown>[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.some((v) => asText(v))) continue; // linha totalmente vazia
    if (isHeaderLike(row)) continue; // cabeçalho repetido pelo Browse
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      // Se a linha de dados é mais curta que o cabeçalho (não traz os metadados
      // do primeiro cabeçalho), os dados estão deslocados: alinha pela 1ª coluna real.
      const dataIdx = row.length < headers.length ? idx - firstRequiredPos : idx;
      if (dataIdx >= 0) obj[h] = row[dataIdx];
    });
    result.push(obj);
  }
  return result;
}

// Acha a coluna certa pelo nome normalizado (aceita variações de nome).
function findColumn(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    const key = normalize(name);
    if (key in row) return row[key];
  }
  return undefined;
}

// SB1: indexado pelas DUAS chaves — "Cod Agregado" e "Codigo" (normalizadas) —
// porque a fórmula original da Compras procura o código primeiro no Codigo e,
// se não achar, no Cod Agregado. Colunas: Tipo, Familia, Sub-familia.
export function importSb1(buffer: Buffer): {
  code: string;
  tipo: string;
  familiaCode: string;
  subfamiliaCode: string;
}[] {
  const rows = readRows(buffer, ["Cod Agregado", "Tipo"]);
  const seen = new Set<string>();
  const out: { code: string; tipo: string; familiaCode: string; subfamiliaCode: string }[] = [];
  rows.forEach((row) => {
    const codAgregado = normalizeCode(findColumn(row, "Cod Agregado", "CodAgregado"));
    const codigo = normalizeCode(findColumn(row, "Codigo", "Código"));
    const record = {
      tipo: asText(findColumn(row, "Tipo")),
      familiaCode: normalizeCode(findColumn(row, "Familia", "Família", "Cod Familia")),
      subfamiliaCode: normalizeCode(findColumn(row, "Sub-familia", "Sub Familia", "SubFamília", "Cod SubFamilia")),
    };
    const keys = [codAgregado, codigo].filter((k): k is string => !!k);
    for (const key of keys) {
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ code: key, ...record });
    }
  });
  return out;
}

// SBZ: indexado por Chave = Codigo + Filial (como a fórmula =B2&A2 da planilha
// original). Código normalizado + filial (4 dígitos).
export function importSbz(buffer: Buffer): {
  chave: string;
  code: string;
  filial: string;
  estoqMin: number | null;
  estoqMax: number | null;
  entraMrp: string;
}[] {
  const rows = readRows(buffer, ["Codigo", "Filial"]);
  const seen = new Set<string>();
  const out: {
    chave: string;
    code: string;
    filial: string;
    estoqMin: number | null;
    estoqMax: number | null;
    entraMrp: string;
  }[] = [];
  rows.forEach((row) => {
    const code = normalizeCode(findColumn(row, "Codigo", "Código", "Cod Item"));
    const filial = branchCode(findColumn(row, "Filial", "Fil"));
    if (!code || !filial) return;
    const chave = code + filial;
    if (seen.has(chave)) return;
    seen.add(chave);
    out.push({
      chave,
      code,
      filial,
      estoqMin: asNumber(findColumn(row, "Estoq Minimo", "Estoque Minimo", "Est Min")),
      estoqMax: asNumber(findColumn(row, "Estoq Maximo", "Estoque Maximo", "Est Max")),
      entraMrp: mrpValue(findColumn(row, "Entra MRP", "EntraMrp", "MRP")),
    });
  });
  return out;
}

// Famílias: códigos normalizados para casar com o familiaCode do SB1.
export function importFamilias(buffer: Buffer): { code: string; descricao: string }[] {
  const rows = readRows(buffer, ["Codigo", "Descricao"]);
  const seen = new Set<string>();
  const out: { code: string; descricao: string }[] = [];
  rows.forEach((row) => {
    const code = normalizeCode(findColumn(row, "Codigo", "Código"));
    if (!code || seen.has(code)) return;
    seen.add(code);
    out.push({ code, descricao: asText(findColumn(row, "Descricao", "Descrição", "Desc")) });
  });
  return out;
}

// SubFamílias: códigos normalizados para casar com o subfamiliaCode do SB1.
export function importSubFamilias(buffer: Buffer): { code: string; descricao: string }[] {
  const rows = readRows(buffer, ["Codigo", "Descricao"]);
  const seen = new Set<string>();
  const out: { code: string; descricao: string }[] = [];
  rows.forEach((row) => {
    const code = normalizeCode(findColumn(row, "Codigo", "Código"));
    if (!code || seen.has(code)) return;
    seen.add(code);
    out.push({ code, descricao: asText(findColumn(row, "Descricao", "Descrição", "Desc")) });
  });
  return out;
}