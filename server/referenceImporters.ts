/**
 * referenceImporters.ts
 * Importadores dos cadastros de referência (SB1, SBZ, Famílias e SubFamílias).
 * Módulo: server (API tRPC)
 * Data: 07/09/2026
 * // MUDANÇA (07/09/2026): arquivo COMPLETO reentregue em bloco único; readRows
 * //   ignora cabeçalhos repetidos; SB1 indexado por Cod Agregado E Codigo
 * //   (normalizados); SBZ chave = código normalizado + filial de 4 dígitos;
 * //   Famílias/SubFamílias com códigos normalizados.
 */

/** Normaliza um código (cópia local, sem importar de outro arquivo). */
export function normalizeCode(codigo: string | null | undefined): string {
  if (!codigo) return '';
  const texto = String(codigo).trim();
  const partes = texto.split('-');
  const numero = (partes[0] || '').replace(/^0+/, '') || '0';
  if (partes.length > 1) {
    return `${numero}-${partes.slice(1).join('-')}`;
  }
  return numero;
}

/** Remove cabeçalhos repetidos e linhas vazias, devolvendo cabeçalho + dados. */
export function readRows(linhasBrutas: unknown[][]): { cabecalho: string[]; dados: string[][] } {
  const naoVazia = (linha: unknown[]) => linha.some((c) => String(c ?? '').trim() !== '');
  const dadosBrutos = linhasBrutas.filter(naoVazia);
  if (dadosBrutos.length === 0) return { cabecalho: [], dados: [] };
  const cabecalho = dadosBrutos[0].map((c) => String(c ?? '').trim());
  const chaveCabecalho = JSON.stringify(dadosBrutos[0]);
  const dados = dadosBrutos
    .slice(1)
    .filter((linha) => JSON.stringify(linha) !== chaveCabecalho)
    .map((linha) => linha.map((c) => String(c ?? '').trim()));
  return { cabecalho, dados };
}

/** Encontra o índice de uma coluna pelo nome (case-insensitive). */
function acharColuna(cabecalho: string[], nomes: string[]): number {
  return cabecalho.findIndex((c) => nomes.some((n) => String(c ?? '').trim().toLowerCase() === n.toLowerCase()));
}

// ---------------------------------------------------------------------------
// SB1
// ---------------------------------------------------------------------------

/** Linha do cadastro SB1 já normalizada. */
export interface Sb1Row {
  codigo: string;      // coluna A (Codigo) normalizado
  codAgregado: string; // coluna B (Cod Agregado) normalizado
  descricao: string;   // coluna C (Descrição)
  tipo: string;        // coluna D (Tipo) — usado no ABC por Filial + Tipo
  familiaCod: string;  // coluna E (Família) normalizado
  subFamiliaCod: string; // coluna G (SubFamília) normalizado
}

/** Índice do SB1 pelas DUAS chaves normalizadas. */
export interface Sb1Index {
  porCodigo: Map<string, Sb1Row>;
  porCodAgregado: Map<string, Sb1Row>;
  registros: Sb1Row[];
}

/**
 * Importa o SB1 e indexa pelas DUAS chaves (Codigo e Cod Agregado), porque a
 * fórmula original era =SEERRO(PROCV(A2;SB1!A:C;3;0);PROCV(A2;SB1!B:C;2;0)).
 * Posições padrão do Browse: A=Codigo, B=Cod Agregado, C=Descrição,
 * D=Tipo, E=Família, F=não usado, G=SubFamília.
 */
export function importSb1(linhasBrutas: unknown[][]): Sb1Index {
  const { dados } = readRows(linhasBrutas);
  const porCodigo = new Map<string, Sb1Row>();
  const porCodAgregado = new Map<string, Sb1Row>();
  const registros: Sb1Row[] = [];

  for (const linha of dados) {
    const codigo = normalizeCode(linha[0]);
    const codAgregado = normalizeCode(linha[1]);
    if (!codigo && !codAgregado) continue; // linha sem código é ignorada
    const registro: Sb1Row = {
      codigo,
      codAgregado,
      descricao: linha[2] ?? '',
      tipo: linha[3] ?? '',
      familiaCod: normalizeCode(linha[4]),
      subFamiliaCod: normalizeCode(linha[6]),
    };
    registros.push(registro);
    if (codigo) porCodigo.set(codigo, registro);
    if (codAgregado) porCodAgregado.set(codAgregado, registro);
  }

  return { porCodigo, porCodAgregado, registros };
}

// ---------------------------------------------------------------------------
// SBZ
// ---------------------------------------------------------------------------

/** Linha do cadastro SBZ já normalizada. */
export interface SbzRow {
  chave: string;   // código normalizado + filial (4 dígitos)
  codigo: string;  // coluna A normalizado
  filial: string;  // coluna B com 4 dígitos
  entraMrp: string; // "Sim" | "Não" (origem "Nao" convertida)
}

/** Índice do SBZ por chave = código + filial. */
export interface SbzIndex {
  porChave: Map<string, SbzRow>;
}

/**
 * Importa o SBZ e indexa por chave = código normalizado + filial, porque a
 * fórmula original usava =B2&A2 (filial + código). A coluna "Entra MRP" é
 * localizada pelo nome no cabeçalho (padrão: terceira coluna).
 */
export function importSbz(linhasBrutas: unknown[][]): SbzIndex {
  const { cabecalho, dados } = readRows(linhasBrutas);
  let indiceMrp = 2; // padrão: terceira coluna
  const achouMrp = acharColuna(cabecalho, ['entra mrp', 'mrp']);
  if (achouMrp >= 0) indiceMrp = achouMrp;

  const porChave = new Map<string, SbzRow>();
  for (const linha of dados) {
    const codigo = normalizeCode(linha[0]);
    const filial = String(linha[1] ?? '').trim().padStart(4, '0');
    if (!codigo || !filial) continue; // linha sem código/filial é ignorada
    const mrpBruto = String(linha[indiceMrp] ?? '').trim();
    const entraMrp = mrpBruto.toLowerCase() === 'nao' ? 'Não'
      : mrpBruto.toLowerCase() === 'sim' ? 'Sim'
      : mrpBruto;
    const chave = `${codigo}${filial}`;
    porChave.set(chave, { chave, codigo, filial, entraMrp });
  }

  return { porChave };
}

// ---------------------------------------------------------------------------
// Famílias e SubFamílias
// ---------------------------------------------------------------------------

/** Mapa de família/subfamília: código normalizado -> descrição. */
export type FamiliasMap = Map<string, string>;

/** Importa o cadastro de Famílias e devolve código normalizado -> descrição. */
export function importFamilias(linhasBrutas: unknown[][]): FamiliasMap {
  const { cabecalho, dados } = readRows(linhasBrutas);
  const indiceDesc = acharColuna(cabecalho, ['descricao', 'descrição', 'desc.']);
  const mapa = new Map<string, string>();
  for (const linha of dados) {
    const codigo = normalizeCode(linha[0]);
    if (!codigo) continue; // linha sem código é ignorada
    const descricao = indiceDesc >= 0 ? linha[indiceDesc] : linha[1];
    mapa.set(codigo, descricao ?? '');
  }
  return mapa;
}

/** Importa o cadastro de SubFamílias e devolve código normalizado -> descrição. */
export function importSubFamilias(linhasBrutas: unknown[][]): FamiliasMap {
  const { cabecalho, dados } = readRows(linhasBrutas);
  const indiceDesc = acharColuna(cabecalho, ['descricao', 'descrição', 'desc.']);
  const mapa = new Map<string, string>();
  for (const linha of dados) {
    const codigo = normalizeCode(linha[0]);
    if (!codigo) continue; // linha sem código é ignorada
    const descricao = indiceDesc >= 0 ? linha[indiceDesc] : linha[1];
    mapa.set(codigo, descricao ?? '');
  }
  return mapa;
}