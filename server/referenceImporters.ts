// ============================================================
// server/referenceImporters.ts
// Importadores dos cadastros de referência (SB1, SBZ, Famílias e SubFamílias).
// Módulo: server (API tRPC)
// Data: 07/09/2026
// MUDANÇA (07/09/2026): corrigido para o LAYOUT REAL dos arquivos (lidos dos
//   anexos). SB1: cod_agregado | codigo | descricao | familia | sub_familia | tipo.
//   SBZ: filial | codigo | estoq_minimo | estoq_maximo | entra_mrp.
//   Famílias/SubFamílias: codigo | descricao.
// MUDANÇA (07/09/2026): SB1 indexado pelas DUAS chaves (cod_agregado E codigo),
//   porque o código da Compras casa com o agregado OU com o código (regra da
//   fórmula =SEERRO(PROCV(A2;SB1!A:C;3;0);PROCV(A2;SB1!B:C;2;0))).
// MUDANÇA (07/09/2026): aceita Buffer OU unknown[][] (auto-detecção).
// MUDANÇA (08/09/2026): branchCode agora normaliza a filial SEMPRE para 4 dígitos
//   (trata "0307-MEGATEC CHAPADAC" e também a filial numérica "307"), porque o
//   cruzamento Compras × SBZ usa a chave código + filial (4 dígitos).
// MUDANÇA (08/09/2026): readRows reforça a remoção de cabeçalhos repetidos do
//   browse do Protheus — além de linhas idênticas ao cabeçalho, ignora qualquer
//   linha cuja primeira célula corresponda a um rótulo conhecido do cabeçalho
//   (filial, codigo, descricao etc.), cobrindo variações do cabeçalho repetido.
// REGRA DE NEGÓCIO (08/09/2026): a SBZ NÃO possui coluna "cod agregado" — o
//   Código da Compras (que é o cod agregado da SB1) deve apontar para o Código
//   da SBZ no cruzamento Compras × SBZ, usando a chave código + filial.
// ============================================================
import * as XLSX from "xlsx";

/** Normaliza um código: remove zeros à esquerda preservando sufixos. */
export function normalizeCode(codigo: string | null | undefined): string {
  if (!codigo) return "";
  const texto = String(codigo).trim();
  const partes = texto.split("-");
  const numero = (partes[0] || "").replace(/^0+/, "") || "0";
  if (partes.length > 1) return `${numero}-${partes.slice(1).join("-")}`;
  return numero;
}

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

/** Normaliza o nome de uma coluna para comparação (minúsculas, sem acento/símbolos). */
function normNome(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function ehBuffer(valor: unknown): valor is Buffer {
  return typeof Buffer !== "undefined" && Buffer.isBuffer(valor);
}

/** Se a origem for Buffer, lê a primeira aba do Excel em linhas brutas (header:1). */
function lerLinhasBrutas(origem: Buffer | unknown[][]): unknown[][] {
  if (ehBuffer(origem)) {
    const workbook = XLSX.read(origem, { type: "buffer", cellText: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("A planilha de referência não possui uma aba.");
    return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: "",
    });
  }
  return origem;
}

/** Localiza a linha do cabeçalho procurando um dos rótulos conhecidos. */
function encontrarLinhaCabecalho(linhas: unknown[][], rotulos: string[]): number {
  const rotNorm = rotulos.map(normNome);
  for (let i = 0; i < linhas.length && i < 80; i++) {
    const linha = linhas[i];
    if (!Array.isArray(linha)) continue;
    if (linha.some((c) => rotNorm.includes(normNome(asText(c))))) return i;
  }
  return -1;
}

/**
 * Lê as linhas de dados, ignorando linhas que não são arrays (células mescladas/
 * objetos) e cabeçalhos repetidos do Browse do Protheus. Aceita Buffer ou linhas já lidas.
 *
 * // REGRA DE NEGÓCIO (08/09/2026): as planilhas exportadas pelo browser do
 * //   Protheus repetem a linha de cabeçalho no meio dos dados — elas devem ser
 * //   ignoradas. Além da igualdade exata com o cabeçalho, ignora qualquer linha
 * //   cuja primeira célula corresponda a um rótulo conhecido do cabeçalho
 * //   (ex.: "Filial", "Codigo", "Descricao"), cobrindo variações do repetido.
 */
export function readRows(
  origem: Buffer | unknown[][],
  rotulosCabecalho: string[] = []
): { cabecalho: string[]; dados: string[][] } {
  const linhasBrutas = lerLinhasBrutas(origem);
  const ehArray = (linha: unknown): linha is unknown[] => Array.isArray(linha);
  const naoVazia = (linha: unknown[]) => linha.some((c) => asText(c) !== "");
  const arrays = linhasBrutas.filter(ehArray).filter(naoVazia);
  if (arrays.length === 0) return { cabecalho: [], dados: [] };

  let idxCabecalho = 0;
  if (rotulosCabecalho.length > 0) {
    const encontrado = encontrarLinhaCabecalho(arrays, rotulosCabecalho);
    if (encontrado >= 0) idxCabecalho = encontrado;
  }

  const cabecalho = arrays[idxCabecalho].map((c) => asText(c));
  const rotulosNorm = new Set(cabecalho.map(normNome).filter(Boolean));

  // Função que decide se a linha é um cabeçalho repetido:
  // (a) idêntica à linha de cabeçalho, OU
  // (b) primeira célula corresponde a um rótulo conhecido do cabeçalho.
  const ehCabecalhoRepetido = (linha: unknown[]): boolean => {
    if (JSON.stringify(linha) === JSON.stringify(arrays[idxCabecalho])) return true;
    const primeira = normNome(asText(linha[0]));
    return primeira !== "" && rotulosNorm.has(primeira);
  };

  const dados = arrays
    .slice(idxCabecalho + 1)
    .filter((linha) => !ehCabecalhoRepetido(linha))
    .map((linha) => linha.map((c) => asText(c)));

  return { cabecalho, dados };
}

/** Índice de uma coluna pelo nome normalizado (ou -1). */
function indiceColuna(cabecalho: string[], nomes: string[]): number {
  const alvo = nomes.map(normNome);
  return cabecalho.findIndex((c) => alvo.includes(normNome(c)));
}

// ---------------------------------------------------------------------------
// SB1
// ---------------------------------------------------------------------------
export interface Sb1Row {
  code: string;            // chave primária: cod_agregado (fallback codigo)
  codigo: string;          // coluna codigo normalizada
  codAgregado: string;     // coluna cod_agregado normalizada
  descricao: string;
  tipo: string;            // usado no ABC por Filial + Tipo
  familiaCode: string;
  subfamiliaCode: string;
}

export interface Sb1Index {
  porCodigo: Map<string, Sb1Row>;
  porCodAgregado: Map<string, Sb1Row>;
  registros: Sb1Row[];
}

/**
 * Importa o SB1. Layout real: cod_agregado | codigo | descricao | familia |
 * sub_familia | tipo. Indexa pelas DUAS chaves (cod_agregado e codigo), porque
 * o código da Compras casa com o agregado OU com o código.
 */
export function importSb1(origem: Buffer | unknown[][]): Sb1Index {
  const { cabecalho, dados } = readRows(origem, ["cod agregado", "codigo", "tipo"]);
  const iAgr = indiceColuna(cabecalho, ["cod agregado"]);
  const iCod = indiceColuna(cabecalho, ["codigo"]);
  const iDesc = indiceColuna(cabecalho, ["descricao"]);
  const iFam = indiceColuna(cabecalho, ["familia"]);
  const iSub = indiceColuna(cabecalho, ["sub-familia", "subfamilia"]);
  const iTip = indiceColuna(cabecalho, ["tipo"]);
  const col = (idx: number, fallback: number) => (idx >= 0 ? idx : fallback);

  const porCodigo = new Map<string, Sb1Row>();
  const porCodAgregado = new Map<string, Sb1Row>();
  const registros: Sb1Row[] = [];

  for (const linha of dados) {
    const codAgregado = normalizeCode(linha[col(iAgr, 0)]);
    const codigo = normalizeCode(linha[col(iCod, 1)]);
    if (!codAgregado && !codigo) continue;
    const registro: Sb1Row = {
      code: codAgregado || codigo,
      codigo,
      codAgregado,
      descricao: asText(linha[col(iDesc, 2)]),
      tipo: asText(linha[col(iTip, 5)]),
      familiaCode: normalizeCode(linha[col(iFam, 3)]),
      subfamiliaCode: normalizeCode(linha[col(iSub, 4)]),
    };
    registros.push(registro);
    if (codigo) porCodigo.set(codigo, registro);
    if (codAgregado) porCodAgregado.set(codAgregado, registro);
    if (registro.code) {
      porCodigo.set(registro.code, registro);
      porCodAgregado.set(registro.code, registro);
    }
  }
  return { porCodigo, porCodAgregado, registros };
}

// ---------------------------------------------------------------------------
// SBZ
// ---------------------------------------------------------------------------
export interface SbzRow {
  chave: string;   // código normalizado + filial (4 dígitos)
  codigo: string;
  filial: string;
  estoqMin: number | null;
  estoqMax: number | null;
  entraMrp: string; // "Sim" | "Não"
}

export interface SbzIndex {
  porChave: Map<string, SbzRow>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const texto = asText(value).replace(/[R$\s]/g, "");
  if (!texto) return null;
  const comma = texto.lastIndexOf(",");
  const dot = texto.lastIndexOf(".");
  const normalizado = comma > dot ? texto.replace(/\./g, "").replace(",", ".") : texto.replace(/,/g, "");
  const resultado = Number(normalizado);
  return Number.isFinite(resultado) ? resultado : null;
}

/**
 * Extrai e normaliza o código da filial para SEMPRE 4 dígitos.
 * // REGRA DE NEGÓCIO (08/09/2026): a coluna Filial do export da SBZ vem
 * //   concatenada com o nome do local após o hífen (ex.: "0307-MEGATEC CHAPADAC").
 * //   O código deve ser normalizado para apenas os 4 dígitos antes do hífen
 * //   (ex.: "0307"), porque o cruzamento Compras × SBZ usa a chave código + filial
 * //   (4 dígitos). Também trata a filial numérica sem zero à esquerda (307 → 0307).
 */
function branchCode(value: unknown): string {
  const texto = asText(value);
  const match = texto.match(/^(\d+)/);
  const digits = match ? match[1] : texto;
  return digits.padStart(4, "0");
}

function mrpValue(value: unknown): string {
  const lower = asText(value).toLowerCase();
  if (!lower) return "";
  if (lower.startsWith("s")) return "Sim";
  if (lower.startsWith("n")) return "Não";
  return asText(value);
}

/**
 * Importa o SBZ e indexa por Chave = código normalizado + filial (=B2&A2).
 * // REGRA DE NEGÓCIO (08/09/2026): a SBZ NÃO tem coluna "cod agregado". O
 * //   Código da Compras (cod agregado da SB1) aponta para o Código da SBZ.
 */
export function importSbz(origem: Buffer | unknown[][]): SbzIndex {
  const { cabecalho, dados } = readRows(origem, ["filial", "codigo"]);
  const iFil = indiceColuna(cabecalho, ["filial"]);
  const iCod = indiceColuna(cabecalho, ["codigo"]);
  const iMin = indiceColuna(cabecalho, ["estoq minimo", "estoque minimo"]);
  const iMax = indiceColuna(cabecalho, ["estoq maximo", "estoque maximo"]);
  const iMrp = indiceColuna(cabecalho, ["entra mrp", "mrp"]);
  const porChave = new Map<string, SbzRow>();

  for (const linha of dados) {
    const codigo = normalizeCode(linha[iCod >= 0 ? iCod : 1]);
    const filial = branchCode(linha[iFil >= 0 ? iFil : 0]);
    if (!codigo || !filial) continue;
    const chave = codigo + filial;
    if (porChave.has(chave)) continue;
    porChave.set(chave, {
      chave,
      codigo,
      filial,
      estoqMin: asNumber(linha[iMin >= 0 ? iMin : 2]),
      estoqMax: asNumber(linha[iMax >= 0 ? iMax : 3]),
      entraMrp: mrpValue(linha[iMrp >= 0 ? iMrp : 4]),
    });
  }
  return { porChave };
}

// ---------------------------------------------------------------------------
// Famílias e SubFamílias
// ---------------------------------------------------------------------------
export type FamiliasMap = Map<string, string>;

/** Importa o cadastro de Famílias: código normalizado -> descrição. */
export function importFamilias(origem: Buffer | unknown[][]): FamiliasMap {
  const { cabecalho, dados } = readRows(origem, ["codigo", "descricao"]);
  const iDesc = indiceColuna(cabecalho, ["descricao", "desc."]);
  const mapa = new Map<string, string>();
  for (const linha of dados) {
    const codigo = normalizeCode(linha[0]);
    if (!codigo) continue;
    mapa.set(codigo, asText(linha[iDesc >= 0 ? iDesc : 1]));
  }
  return mapa;
}

/** Importa o cadastro de SubFamílias: código normalizado -> descrição. */
export function importSubFamilias(origem: Buffer | unknown[][]): FamiliasMap {
  const { cabecalho, dados } = readRows(origem, ["codigo", "descricao"]);
  const iDesc = indiceColuna(cabecalho, ["descricao", "desc."]);
  const mapa = new Map<string, string>();
  for (const linha of dados) {
    const codigo = normalizeCode(linha[0]);
    if (!codigo) continue;
    mapa.set(codigo, asText(linha[iDesc >= 0 ? iDesc : 1]));
  }
  return mapa;
}