/**
 * protheusImport.ts
 * Importação e tratamento da planilha de Compras (Protheus).
 * Módulo: server (API tRPC)
 * Data: 07/09/2026
 * // MUDANÇA (07/09/2026): arquivo COMPLETO reentregue em bloco único, com
 * //   código normalizado na entrada, validação das 13 colunas de meses e
 * //   limite de 25.000 registros.
 */

import type { PurchaseRow } from './protheusCalculations';
import type { Sb1Index, SbzIndex, FamiliasMap } from './referenceImporters';

/** Limite máximo de registros aceitos na importação de Compras. */
export const LIMITE_REGISTROS = 25000;

/** Quantidade de colunas de meses esperadas na planilha de Compras. */
export const QTD_COLUNAS_MESES = 13;

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

/** Lê linhas ignorando cabeçalhos repetidos e linhas vazias (cópia local). */
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

/** Localiza as colunas de código, filial e descrição pelo nome no cabeçalho. */
function localizarColunas(cabecalho: string[]): { codigo: number; filial: number; descricao: number } {
  const achar = (nomes: string[]) =>
    cabecalho.findIndex((c) => nomes.some((n) => String(c ?? '').trim().toLowerCase() === n.toLowerCase()));
  const codigo = achar(['codigo', 'código', 'cod.']);
  const filial = achar(['filial', 'fil.', 'cod. filial']);
  const descricao = achar(['descricao', 'descrição', 'desc.']);
  return {
    codigo: codigo >= 0 ? codigo : 0,
    filial: filial >= 0 ? filial : 1,
    descricao: descricao >= 0 ? descricao : 2,
  };
}

/**
 * Valida se o cabeçalho possui 13 colunas de meses consecutivas.
 * Retorna o índice inicial das colunas de meses (ou erro amigável).
 */
export function validarColunasMeses(cabecalho: string[]): { ok: boolean; indiceInicial: number; mensagem: string } {
  const regexMes = /^(\d{1,2}[\/-]\d{4}|[a-z]{3,9}[\/-]\d{1,4}|[a-z]{3,9}\s*\d{4})$/i;
  for (let i = 0; i <= cabecalho.length - QTD_COLUNAS_MESES; i++) {
    const fatia = cabecalho.slice(i, i + QTD_COLUNAS_MESES);
    if (fatia.every((c) => regexMes.test(String(c ?? '').trim()))) {
      return { ok: true, indiceInicial: i, mensagem: '' };
    }
  }
  return {
    ok: false,
    indiceInicial: -1,
    mensagem: `Não encontrei 13 colunas de meses consecutivas. Cabeçalho recebido: ${cabecalho.join(' | ')}`,
  };
}

/**
 * Converte as linhas brutas da planilha de Compras em registros normalizados.
 * Normaliza o código, mantém valores numéricos e aplica o limite de 25.000.
 */
export function parseRegistrosCompras(linhasBrutas: unknown[][]): { registros: PurchaseRow[]; avisos: string[] } {
  const { cabecalho, dados } = readRows(linhasBrutas);
  if (dados.length === 0) {
    throw new Error('A planilha de Compras está vazia (só tem cabeçalho).');
  }
  if (dados.length > LIMITE_REGISTROS) {
    throw new Error(`A planilha tem ${dados.length} registros, acima do limite de ${LIMITE_REGISTROS}.`);
  }
  const colunas = localizarColunas(cabecalho);
  const validacao = validarColunasMeses(cabecalho);
  if (!validacao.ok) {
    throw new Error(validacao.mensagem);
  }
  const inicioMeses = validacao.indiceInicial;
  const registros: PurchaseRow[] = [];
  const avisos: string[] = [];

  dados.forEach((linha) => {
    const codigoOriginal = String(linha[colunas.codigo] ?? '').trim();
    if (!codigoOriginal) return; // linha sem código é ignorada
    const valores: number[] = [];
    for (let m = 0; m < QTD_COLUNAS_MESES; m++) {
      const bruto = String(linha[inicioMeses + m] ?? '').trim();
      // interpreta números no formato brasileiro: 1.234,56 -> 1234.56
      const numerico = Number(bruto.replace(/\./g, '').replace(',', '.')) || 0;
      valores.push(numerico);
    }
    registros.push({
      codigoOriginal,
      codigo: normalizeCode(codigoOriginal),
      filial: String(linha[colunas.filial] ?? '').trim().padStart(4, '0'),
      descricao: String(linha[colunas.descricao] ?? '').trim(),
      familia: '',
      subFamilia: '',
      mrp: '',
      tipo: '',
      valores,
      total: valores.reduce((acc, v) => acc + v, 0),
    });
  });

  if (registros.length === 0) {
    throw new Error('Nenhum registro de Compras foi lido. Verifique o cabeçalho da planilha.');
  }
  return { registros, avisos };
}

/**
 * Cruza os registros de Compras com SB1, SBZ, Famílias e SubFamílias.
 * SB1 procura primeiro pelo Codigo; se não achar, procura pelo Cod Agregado
 * (regra da fórmula original =SEERRO(PROCV(...);PROCV(...))).
 */
export function enriquecerCompras(
  registros: PurchaseRow[],
  sb1: Sb1Index,
  sbz: SbzIndex,
  familias: FamiliasMap,
  subFamilias: FamiliasMap,
): PurchaseRow[] {
  return registros.map((r) => {
    // 1) SB1 pelas DUAS chaves: Codigo primeiro, depois Cod Agregado
    const porCodigo = sb1.porCodigo.get(r.codigo);
    const sb1Row = porCodigo ?? sb1.porCodAgregado.get(r.codigo);

    let familia = '';
    let subFamilia = '';
    let tipo = '';
    let descricao = r.descricao;

    if (sb1Row) {
      descricao = sb1Row.descricao || r.descricao;
      tipo = sb1Row.tipo || '';
      const fam = normalizeCode(sb1Row.familiaCod);
      if (fam && familias.has(fam)) familia = familias.get(fam) ?? '';
      const sub = normalizeCode(sb1Row.subFamiliaCod);
      if (sub && subFamilias.has(sub)) subFamilia = subFamilias.get(sub) ?? '';
    }

    // 2) SBZ por chave = código normalizado + filial (para o MRP)
    const chaveSbz = `${r.codigo}${r.filial}`;
    const mrpBruto = (sbz.porChave.get(chaveSbz)?.entraMrp ?? '').trim().toLowerCase();
    const mrp = mrpBruto === 'nao' ? 'Não' : mrpBruto === 'sim' ? 'Sim' : mrpBruto;

    return { ...r, descricao, familia, subFamilia, mrp, tipo };
  });
}

/**
 * Pipeline completo de importação: lê, valida e cruza a planilha de Compras.
 * Devolve os registros prontos para a gravação (a gravação atômica com
 * histórico fica no router, que já estava funcionando).
 */
export function importarCompras(
  linhasBrutas: unknown[][],
  sb1: Sb1Index,
  sbz: SbzIndex,
  familias: FamiliasMap,
  subFamilias: FamiliasMap,
): { registros: PurchaseRow[]; avisos: string[] } {
  const { registros, avisos } = parseRegistrosCompras(linhasBrutas);
  return { registros: enriquecerCompras(registros, sb1, sbz, familias, subFamilias), avisos };
}