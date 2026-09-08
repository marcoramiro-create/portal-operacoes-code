/**
 * protheusImport.ts
 * Importação e tratamento da planilha de Compras (Protheus).
 * Módulo: server (API tRPC)
 * Data: 09/09/2026
 *
 * // MUDANÇA (09/09/2026): a leitura PRESERVA valores numéricos (não converte
 * //   tudo para texto) e lê TODAS as colunas relevantes (Estoque, CustoUn13M,
 * //   CustoTot13M, Pedidos, Última Compra). Os cálculos de negócio
 * //   (stockValue, cobertura, excedente, giro, curva ABCDE) são feitos no
 * //   código (protheusCalculations.ts) — as fórmulas da planilha e os valores
 * //   da macro são IGNORADOS. Regras de negócio gravadas como comentários.
 * // MUDANÇA (09/09/2026): filial da Compras normalizada para 4 dígitos mesmo
 * //   se vier concatenada (ex.: "0101-MEGATEC" -> "0101"), garantindo que a
 * //   chave do cruzamento Compras × SBZ seja sempre (código + filial 4 dígitos).
 *
 * // REGRA DE NEGÓCIO — COLUNAS LIDAS DA EXPORTAÇÃO CRUA:
 * //   A=Codigo, D=Filial, K=Última Compra, L..X=13 meses de vendas,
 * //   Y=Qtd13M, Z=CustoUn13M, AA=CustoTot13M, AF=Estoque, AG=Pedidos.
 * //   PRAZO (AD) NÃO é lido — é cravado pelo comprador no sistema (09/09/2026).
 * //   As demais colunas (fórmulas do usuário e da macro) são ignoradas.
 */
import type { PurchaseRow } from './protheusCalculations';
import { calcularCamposBase, calcularCurvasAbcde } from './protheusCalculations';
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

/**
 * Normaliza a filial para SEMPRE 4 dígitos numéricos.
 * // REGRA DE NEGÓCIO (09/09/2026): a filial pode vir concatenada com o nome
 * //   do local ("0307-MEGATEC CHAPADAC") ou como número sem zero à esquerda
 * //   (307). Extrai os dígitos iniciais e completa para 4 (0307), porque o
 * //   cruzamento Compras × SBZ usa a chave código + filial (4 dígitos).
 */
function normalizarFilial(value: unknown): string {
  const texto = String(value ?? '').trim();
  const match = texto.match(/^(\d+)/);
  const digits = match ? match[1] : texto;
  return digits.padStart(4, '0');
}

/**
 * Lê uma célula como número, preservando o valor numérico do arquivo.
 * Se a célula já for número (XLSX), usa direto. Se for texto, tenta
 * interpretar no formato brasileiro (1.234,56 -> 1234.56) quando há vírgula.
 */
function num(cell: unknown): number {
  if (cell == null) return 0;
  if (typeof cell === 'number') return isFinite(cell) ? cell : 0;
  const s = String(cell).trim();
  if (s === '') return 0;
  let t = s;
  if (s.includes(',')) {
    t = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(t);
  return isNaN(n) ? 0 : n;
}

/** Converte o serial de data do Excel (base 1899-12-30) em Date. */
function serialParaData(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
}

/**
 * Lê uma célula de data (Última Compra). Aceita Date, serial do Excel,
 * texto ISO ou dd/mm/aaaa. Retorna ISO (YYYY-MM-DD) ou '' se não conseguir.
 */
function lerData(cell: unknown): string {
  if (cell == null) return '';
  if (cell instanceof Date) {
    return isNaN(cell.getTime()) ? '' : cell.toISOString().slice(0, 10);
  }
  if (typeof cell === 'number') {
    const d = serialParaData(cell);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  const s = String(cell).trim();
  if (!s) return '';
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

/**
 * Extrai a data de emissão do nome do arquivo (ex.: "Compras - 202609061240.xlsx"
 * -> 06/09/2026). Usada no giro (360 + dia do mês corrente) e na curva D/E.
 */
export function emissaoDoNomeArquivo(nomeArquivo: string | null | undefined): Date | null {
  if (!nomeArquivo) return null;
  const m = nomeArquivo.match(/(\d{8})/);
  if (!m) return null;
  const s = m[1];
  const ano = Number(s.slice(0, 4));
  const mes = Number(s.slice(4, 6));
  const dia = Number(s.slice(6, 8));
  const d = new Date(ano, mes - 1, dia);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Lê linhas ignorando cabeçalhos repetidos, linhas vazias e linhas que não
 * são arrays. // MUDANÇA (09/09/2026): as células de DADOS preservam o valor
 * original (números continuam números) — só o cabeçalho é convertido em texto.
 */
export function readRows(linhasBrutas: unknown[][]): { cabecalho: string[]; dados: unknown[][] } {
  const ehArray = (linha: unknown): linha is unknown[] => Array.isArray(linha);
  const naoVazia = (linha: unknown[]) => linha.some((c) => String(c ?? '').trim() !== '');
  const dadosBrutos = linhasBrutas.filter(ehArray).filter(naoVazia);
  if (dadosBrutos.length === 0) return { cabecalho: [], dados: [] };
  const cabecalho = dadosBrutos[0].map((c) => String(c ?? '').trim());
  const chaveCabecalho = JSON.stringify(dadosBrutos[0]);
  const dados = dadosBrutos
    .slice(1)
    .filter((linha) => JSON.stringify(linha) !== chaveCabecalho);
  return { cabecalho, dados };
}

/** Localiza as colunas relevantes pelo nome no cabeçalho. */
function localizarColunas(cabecalho: string[]): Record<string, number> {
  const achar = (nomes: string[]) =>
    cabecalho.findIndex((c) =>
      nomes.some((n) => String(c ?? '').trim().toLowerCase() === n.toLowerCase()),
    );
  const col = (nomes: string[], padrao: number) => {
    const i = achar(nomes);
    return i >= 0 ? i : padrao;
  };
  return {
    codigo: col(['codigo', 'código', 'cod.'], 0),
    filial: col(['filial', 'fil.', 'cod. filial'], 1),
    descricao: col(['descricao', 'descrição', 'desc.'], 2),
    ultimaCompra: col(['ultima compra', 'última compra', 'ult. compra'], -1),
    custoUn13M: col(['custoun13m', 'custo un13m', 'custo un 13m', 'custo un.'], -1),
    custoTot13M: col(['custotot13m', 'custo tot13m', 'custo tot 13m', 'custo total'], -1),
    estoque: col(['estoque', 'saldo'], -1),
    pedidos: col(['pedidos'], -1),
    qtd13M: col(['qtd13m', 'qtd 13m', 'qtd.13m'], -1),
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
 * // MUDANÇA (09/09/2026): lê TODAS as colunas relevantes preservando números.
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
      valores.push(num(linha[inicioMeses + m]));
    }
    registros.push({
      codigoOriginal,
      codigo: normalizeCode(codigoOriginal),
      filial: normalizarFilial(linha[colunas.filial]), // sempre 4 dígitos
      descricao: String(linha[colunas.descricao] ?? '').trim(),
      familia: '',
      subFamilia: '',
      mrp: '',
      tipo: '',
      valores,
      total: valores.reduce((acc, v) => acc + v, 0),
      ultimaCompra: lerData(linha[colunas.ultimaCompra]),
      qtd13M: num(linha[colunas.qtd13M]),
      custoUn13M: num(linha[colunas.custoUn13M]),
      custoTot13M: num(linha[colunas.custoTot13M]),
      prazo: 0, // NÃO lido (cravado pelo comprador no sistema)
      estoque: num(linha[colunas.estoque]),
      pedidos: num(linha[colunas.pedidos]),
      mediaP13M: 0, cd: 0, es: 0, em: 0, pp: 0, comprar: 0,
      rescencia: 0, nroMeses: 0, frequencia: 0, nota: 0, classificacao: '',
      stockValue: 0, coverageDays: 0, excessValue: 0, turnover: 0,
      classeMacro: 'C', curva: 'C',
    });
  });
  if (registros.length === 0) {
    throw new Error('Nenhum registro de Compras foi lido. Verifique o cabeçalho da planilha.');
  }
  return { registros, avisos };
}

/**
 * Converte as linhas brutas em registros normalizados (sem cruzar cadastros).
 * Calcula os campos base (não dependem de Tipo/cadastros).
 */
export function parseProtheusWorkbook(linhasBrutas: unknown[][], emissao?: Date | null): PurchaseRow[] {
  const { registros } = parseRegistrosCompras(linhasBrutas);
  return calcularCamposBase(registros);
}

/**
 * Cruza os registros de Compras com SB1, SBZ, Famílias e SubFamílias.
 * SB1 procura primeiro pelo Codigo; se não achar, procura pelo Cod Agregado
 * (regra da fórmula original =SEERRO(PROCV(...);PROCV(...))).
 * // REGRA DE NEGÓCIO (09/09/2026): SBZ NÃO tem coluna "cod agregado" — o
 * //   Código da Compras (cod agregado da SB1) aponta para o Código da SBZ,
 * //   pela chave (código normalizado + filial 4 dígitos).
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
 * Pipeline completo de importação: lê, valida, cruza e CALCULA tudo.
 * Devolve os registros prontos para a gravação, com stockValue, coverageDays,
 * excessValue, turnover e curva ABCDE já preenchidos.
 */
export function importarCompras(
  linhasBrutas: unknown[][],
  sb1: Sb1Index,
  sbz: SbzIndex,
  familias: FamiliasMap,
  subFamilias: FamiliasMap,
  emissao?: Date | null,
): { registros: PurchaseRow[]; avisos: string[] } {
  const { registros, avisos } = parseRegistrosCompras(linhasBrutas);
  const enriquecidos = enriquecerCompras(registros, sb1, sbz, familias, subFamilias);
  const comBase = calcularCamposBase(enriquecidos);
  const completos = calcularCurvasAbcde(comBase, emissao);
  return { registros: completos, avisos };
}

/**
 * Re-enriquecimento AUTOMÁTICO dos itens da Compras (08/09/2026).
 * Reconstrói registros a partir dos itens JÁ GRAVADOS da importação EM USO e
 * roda o MESMO cruzamento do enriquecerCompras com os cadastros recém-
 * importados. Itens sem correspondência ficam com os campos em branco (não
 * são excluídos). A gravação de volta fica no router (processReference).
 * // NOTA (09/09/2026): este fluxo re-cruza apenas cadastros (familia/
 * //   subFamilia/mrp/tipo). O recálculo completo (curva/financeiros) ocorre
 * //   na importação da Compras. Se o Tipo mudar aqui, reimporte a Compras
 * //   para recalcular a curva ABCDE.
 */
export function reenriquecerCompras(
  itens: Array<{ codigo: string; filial: string; descricao: string }>,
  sb1: Sb1Index,
  sbz: SbzIndex,
  familias: FamiliasMap,
  subFamilias: FamiliasMap,
): Array<{ codigo: string; filial: string; descricao: string; familia: string; subFamilia: string; mrp: string; tipo: string }> {
  const base: PurchaseRow[] = itens.map((item) => ({
    codigoOriginal: item.codigo,
    codigo: item.codigo,
    filial: item.filial,
    descricao: item.descricao,
    familia: '',
    subFamilia: '',
    mrp: '',
    tipo: '',
    valores: [],
    total: 0,
    ultimaCompra: '',
    qtd13M: 0, custoUn13M: 0, custoTot13M: 0, prazo: 0, estoque: 0, pedidos: 0,
    mediaP13M: 0, cd: 0, es: 0, em: 0, pp: 0, comprar: 0,
    rescencia: 0, nroMeses: 0, frequencia: 0, nota: 0, classificacao: '',
    stockValue: 0, coverageDays: 0, excessValue: 0, turnover: 0,
    classeMacro: 'C', curva: 'C',
  }));
  const enriquecidos = enriquecerCompras(base, sb1, sbz, familias, subFamilias);
  return enriquecidos.map((r) => ({
    codigo: r.codigo,
    filial: r.filial,
    descricao: r.descricao,
    familia: r.familia,
    subFamilia: r.subFamilia,
    mrp: r.mrp,
    tipo: r.tipo,
  }));
}