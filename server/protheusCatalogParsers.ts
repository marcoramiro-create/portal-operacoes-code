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
 */
import * as XLSX from "xlsx";
import { cleanSourceText, normalizeBranchCode, normalizeProductCode, normalizeSupplierKey } from "./operationalNormalization";

export type RegistrationIssue = { row: number; field: string; message: string };
export type RegistrationResult<T> = { rows: T[]; sourceRows: number; skippedRows: number; duplicateRows: number; issues: RegistrationIssue[] };
type CsvRow = string[];

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
  if (value || row.length) {
    row.push(value);
    if (row.some(v => cleanSourceText(v) !== "")) rows.push(row);
  }
  return rows;
}

/** Detecta se o Buffer é um arquivo .xlsx (ZIP com assinatura "PK"). */
function ehBufferXlsx(content: Buffer): boolean {
  return (
    content.length >= 4 &&
    content[0] === 0x50 &&
    content[1] === 0x4b &&
    (content[2] === 0x03 || content[2] === 0x05 || content[2] === 0x07) &&
    content[3] === 0x04
  );
}

/**
 * Lê as linhas brutas de um arquivo, aceitando .xlsx E texto/CSV.
 * - .xlsx: lê a primeira aba com o leitor de Excel, preservando cada célula como texto
 *   (zeros à esquerda intactos; a normalização acontece depois, nas funções de negócio).
 * - texto/CSV: mantém o fluxo original (parseCsv + decodificação UTF-8/Windows-1252).
 */
function lerLinhasBrutas(content: Buffer | string): CsvRow[] {
  if (!(content instanceof Buffer)) return parseCsv(content);
  if (ehBufferXlsx(content)) {
    try {
      const workbook = XLSX.read(content, { type: "buffer", cellText: false });
      const sheetName = workbook.SheetNames[0];
      if (sheetName) {
        const linhas = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
          header: 1,
          raw: false,
          defval: "",
        });
        return linhas
          .filter((linha): linha is unknown[] => Array.isArray(linha))
          .map((linha) => linha.map((celula) => String(celula ?? "").trim()))
          .filter((linha) => linha.some((c) => c !== ""));
      }
    } catch {
      // Arquivo .xlsx corrompido/inválido: cai no fallback de texto abaixo.
    }
  }
  return parseCsv(new TextDecoder("utf-8").decode(content).replace(/^\uFEFF/, ""));
}

// Apelidos aceitos por tipo de cabeçalho (cada item = variações do mesmo rótulo).
const SB1_HEADER = [["codigo", "cod"], ["codagregado", "codagreg", "codigodoagregado"], ["descricao", "desc", "descricaodoproduto"]];
const SBZ_HEADER = [["filial", "codigofilial", "fil"], ["codigo", "cod", "produto"], ["entramrp", "mrp", "entranomrp"]];
const SB5_HEADER = [["produto", "codigo", "cod"], ["marcapeca", "marcadapeca"]];
const SA2_HEADER = [["codigo", "cod"], ["loja", "filial", "store"], ["razaosocial", "nome", "fornecedor"]];

// Procura a linha do cabeçalho comparando grupos de apelidos normalizados.
function headerIndex(rows: CsvRow[], requiredGroups: string[][]): number {
  return rows.findIndex(row =>
    requiredGroups.every(group =>
      row.some(h => group.some(alias => normalizeHeader(h) === normalizeHeader(alias))),
    ),
  );
}

// Lê o arquivo e localiza o cabeçalho (linhas 1 a 4 e além), tentando rótulos.
// Para texto, tenta também UTF-8 e Windows-1252 (usa a que encontrar o cabeçalho).
function readRowsWithHeader(content: Buffer | string, requiredGroups: string[][]): { rows: CsvRow[]; header: number } {
  if (typeof content === "string") {
    const rows = lerLinhasBrutas(content);
    return { rows, header: headerIndex(rows, requiredGroups) };
  }
  if (ehBufferXlsx(content)) {
    const rows = lerLinhasBrutas(content);
    return { rows, header: headerIndex(rows, requiredGroups) };
  }
  const candidates = [
    new TextDecoder("utf-8").decode(content).replace(/^\uFEFF/, ""),
    new TextDecoder("windows-1252").decode(content),
  ];
  let fallback: { rows: CsvRow[]; header: number } | null = null;
  for (const text of candidates) {
    const rows = parseCsv(text);
    const header = headerIndex(rows, requiredGroups);
    if (header >= 0) return { rows, header };
    if (!fallback || rows.length > fallback.rows.length) fallback = { rows, header };
  }
  return fallback ?? { rows: [], header: -1 };
}

function mapHeaders(header: CsvRow) {
  return new Map(header.map((value, index) => [normalizeHeader(value), index]));
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
  return /^[-+]?\d+(?:[,.]\d+)?e[-+]?\d+$/i.test(value) || /^[-+]?\d+[,.]?\d*e[+]?\d+$/i.test(value);
}

export type Sb1Row = {
  productCode: string; normalizedProductCode: string; aggregateProductCode: string;
  normalizedAggregateProductCode: string; description: string; type: string;
  family: string; subfamily: string; ncm: string; inclusionDate: string;
};

export function parseSb1(content: Buffer | string): RegistrationResult<Sb1Row> {
  const { rows, header } = readRowsWithHeader(content, SB1_HEADER);
  if (header < 0) throw new Error("SB1: cabeçalho não encontrado. Esperadas as colunas Código, Cod Agregado e Descrição (o cabeçalho pode estar nas linhas 1 a 4).");
  const map = mapHeaders(rows[header]);
  const out = emptyResult<Sb1Row>();
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
      out.issues.push({ row: header + offset + 2, field: "Codigo", message: `Código duplicado; linha anterior ${previous}.` });
      const index = previous - header - 2;
      const prior = out.rows[index];
      if (prior && Object.values(current).filter(Boolean).length > Object.values(prior).filter(Boolean).length) out.rows[index] = current;
      return;
    }
    seen.set(code, header + offset + 2);
    out.rows.push(current);
  });
  return out;
}

export type SbzRow = {
  branchCode: string; productCode: string; taxGroup: string; type: string;
  minStock: string; maxStock: string; origin: string; mrp: boolean; fiscalClass: string;
};

export function parseSbz(content: Buffer | string): RegistrationResult<SbzRow> {
  const { rows, header } = readRowsWithHeader(content, SBZ_HEADER);
  if (header < 0) throw new Error("SBZ: cabeçalho não encontrado. Esperadas as colunas Filial, Código e Entra MRP (o cabeçalho pode estar nas linhas 1 a 4).");
  const map = mapHeaders(rows[header]);
  const out = emptyResult<SbzRow>();
  const seen = new Set<string>();
  rows.slice(header + 1).forEach((row, offset) => {
    if (!row.some(v => cleanSourceText(v))) return;
    out.sourceRows += 1;
    const branch = normalizeBranchCode(get(row, map, "Filial")), raw = get(row, map, "Codigo"), product = normalizeProductCode(raw);
    if (!branch || !product || invalidScientific(raw)) {
      out.skippedRows += 1;
      out.issues.push({ row: header + offset + 2, field: "Codigo", message: "Linha sem código de produto válido." });
      return;
    }
    const key = `${branch}|${product}`;
    if (seen.has(key)) {
      out.duplicateRows += 1;
      out.issues.push({ row: header + offset + 2, field: "Codigo", message: `Chave código+filial duplicada: ${key}.` });
      return;
    }
    seen.add(key);
    out.rows.push({
      branchCode: branch,
      productCode: product,
      taxGroup: get(row, map, "Grupo Trib."),
      type: get(row, map, "Tipo"),
      minStock: get(row, map, "Estoq Minimo"),
      maxStock: get(row, map, "Estoq Maximo"),
      origin: get(row, map, "Origem"),
      mrp: /^(sim|s|yes|1)$/i.test(get(row, map, "Entra MRP")),
      fiscalClass: get(row, map, "Class.Fiscal"),
    });
  });
  return out;
}

export type Sb5Row = {
  productCode: string; technicalFamily: string; partFamily: string; partBrand: string; partLine: string;
};

export function parseSb5(content: Buffer | string): RegistrationResult<Sb5Row> {
  const { rows, header } = readRowsWithHeader(content, SB5_HEADER);
  if (header < 0) throw new Error("SB5: cabeçalho não encontrado. Esperadas as colunas Produto e Marca Peça (o cabeçalho pode estar nas linhas 1 a 4).");
  const map = mapHeaders(rows[header]);
  const out = emptyResult<Sb5Row>();
  const seen = new Set<string>();
  rows.slice(header + 1).forEach((row, offset) => {
    if (!row.some(v => cleanSourceText(v))) return;
    out.sourceRows += 1;
    const raw = get(row, map, "Produto"), product = normalizeProductCode(raw);
    if (!product || invalidScientific(raw)) {
      out.skippedRows += 1;
      out.issues.push({ row: header + offset + 2, field: "Produto", message: "Produto vazio ou em notação científica." });
      return;
    }
    if (seen.has(product)) {
      out.duplicateRows += 1;
      out.issues.push({ row: header + offset + 2, field: "Produto", message: `Produto alternativo duplicado: ${product}.` });
      return;
    }
    seen.add(product);
    out.rows.push({
      productCode: product,
      technicalFamily: get(row, map, "Familia Tec."),
      partFamily: get(row, map, "Família Peça", "Familia Peca"),
      partBrand: get(row, map, "Marca Peca"),
      partLine: get(row, map, "Linha Peça", "Linha Peca"),
    });
  });
  return out;
}

export type Sa2Row = {
  supplierCode: string; store: string; document: string; legalName: string; tradeAddress: string;
  number: string; zipCode: string; neighborhood: string; municipality: string; state: string;
};

export function parseSa2(content: Buffer | string): RegistrationResult<Sa2Row> {
  const { rows, header } = readRowsWithHeader(content, SA2_HEADER);
  if (header < 0) throw new Error("SA2: cabeçalho não encontrado. Esperadas as colunas Código, Loja e Razão Social (o cabeçalho pode estar nas linhas 1 a 4).");
  const map = mapHeaders(rows[header]);
  const out = emptyResult<Sa2Row>();
  const seen = new Set<string>();
  rows.slice(header + 1).forEach((row, offset) => {
    if (!row.some(v => cleanSourceText(v))) return;
    out.sourceRows += 1;
    const code = get(row, map, "Codigo"), store = get(row, map, "Loja"), name = get(row, map, "Razao Social"), document = get(row, map, "CNPJ/CPF");
    if (!code || !store || !name || /^\.\s*\.\s*\/\s*-?$/.test(document)) {
      out.skippedRows += 1;
      out.issues.push({ row: header + offset + 2, field: "Codigo/Loja", message: "Fornecedor sem chave ou linha de controle da extração." });
      return;
    }
    const key = normalizeSupplierKey(code, store);
    if (seen.has(key)) {
      out.duplicateRows += 1;
      out.issues.push({ row: header + offset + 2, field: "Codigo+Loja", message: `Fornecedor duplicado: ${key}.` });
      return;
    }
    seen.add(key);
    out.rows.push({
      supplierCode: code,
      store,
      document,
      legalName: name,
      tradeAddress: get(row, map, "Endereço", "Endereco"),
      number: get(row, map, "Numero"),
      zipCode: get(row, map, "CEP"),
      neighborhood: get(row, map, "Bairro"),
      municipality: get(row, map, "Município", "Municipio", "Munícipio"),
      state: get(row, map, "Estado"),
    });
  });
  return out;
}