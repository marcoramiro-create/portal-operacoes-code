// ============================================================
// server/referenceImporters.ts  (VERSÃO MELHORADA)
// Detecta automaticamente as colunas pelo cabeçalho,
// ignorando maiúsculas, acentos e espaços.
// ============================================================
import * as XLSX from "xlsx";

// Normaliza um texto: minúsculas, sem acentos, sem espaços/símbolos
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");        // remove espaços e símbolos
}

function asText(value: unknown) { return String(value ?? "").trim(); }

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

// Lê as linhas a partir da linha de cabeçalho e devolve
// as linhas com as colunas já normalizadas (chave = nome normalizado)
function readRows(buffer: Buffer, headerRowIndex: number): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellText: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("A planilha de referência não possui uma aba.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
  const headerRow = rows[headerRowIndex - 1];
  if (!headerRow) throw new Error(`Não foi possível localizar a linha de cabeçalho (linha ${headerRowIndex}).`);
  const headers = headerRow.map(h => normalize(asText(h)));
  const result: Record<string, unknown>[] = [];
  for (let i = headerRowIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.some(v => asText(v))) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => { if (h) obj[h] = row[idx]; });
    result.push(obj);
  }
  return result;
}

// Acha a coluna certa pelo nome normalizado (aceita variações)
function findColumn(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    const key = normalize(name);
    if (key in row) return row[key];
  }
  return undefined;
}

// SB1: chave = Codigo. Colunas: Tipo, Familia, Sub-familia.
export function importSb1(buffer: Buffer): { code: string; tipo: string; familiaCode: string; subfamiliaCode: string }[] {
  const rows = readRows(buffer, 3);
  const seen = new Set<string>();
  const out: { code: string; tipo: string; familiaCode: string; subfamiliaCode: string }[] = [];
  rows.forEach(row => {
    const code = asText(findColumn(row, "Codigo", "Código", "Cod Item", "Codigo do Item"));
    if (!code || seen.has(code)) return;
    seen.add(code);
    out.push({
      code,
      tipo: asText(findColumn(row, "Tipo")),
      familiaCode: asText(findColumn(row, "Familia", "Família", "Cod Familia")),
      subfamiliaCode: asText(findColumn(row, "Sub-familia", "SubFamília", "Sub Familia", "Cod SubFamilia")),
    });
  });
  return out;
}

// SBZ: chave = Codigo + Filial. Colunas: Estoq Minimo, Estoq Maximo, Entra MRP.
export function importSbz(buffer: Buffer): { chave: string; code: string; filial: string; estoqMin: number | null; estoqMax: number | null; entraMrp: string }[] {
  const rows = readRows(buffer, 3);
  const seen = new Set<string>();
  const out: { chave: string; code: string; filial: string; estoqMin: number | null; estoqMax: number | null; entraMrp: string }[] = [];
  rows.forEach(row => {
    const code = asText(findColumn(row, "Codigo", "Código", "Cod Item"));
    const filial = asText(findColumn(row, "Filial", "Fil"));
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
      entraMrp: asText(findColumn(row, "Entra MRP", "EntraMrp", "MRP")),
    });
  });
  return out;
}

// Família fixa (cabeçalho na linha 4)
export function importFamilias(buffer: Buffer): { code: string; descricao: string }[] {
  const rows = readRows(buffer, 4);
  const seen = new Set<string>();
  const out: { code: string; descricao: string }[] = [];
  rows.forEach(row => {
    const code = asText(findColumn(row, "codigo", "Codigo", "Código"));
    if (code && !seen.has(code)) { seen.add(code); out.push({ code, descricao: asText(findColumn(row, "descricao", "Descrição", "Desc")) }); }
  });
  return out;
}

// Subfamília fixa (cabeçalho na linha 4)
export function importSubFamilias(buffer: Buffer): { code: string; descricao: string }[] {
  const rows = readRows(buffer, 4);
  const seen = new Set<string>();
  const out: { code: string; descricao: string }[] = [];
  rows.forEach(row => {
    const code = asText(findColumn(row, "codigo", "Codigo", "Código"));
    if (code && !seen.has(code)) { seen.add(code); out.push({ code, descricao: asText(findColumn(row, "descricao", "Descrição", "Desc")) }); }
  });
  return out;
}