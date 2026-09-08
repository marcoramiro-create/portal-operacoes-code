/**
 * protheusCalculations.ts
 * Cálculos de média P13M, curva ABCDE, giro, cobertura e excedente do painel.
 * Módulo: server (API tRPC)
 * Data: 09/09/2026
 *
 * // MUDANÇA (09/09/2026): TODOS os cálculos passam a ser feitos no código.
 * //   As fórmulas da planilha (do Protheus e as acrescidas pelo usuário) e os
 * //   valores gravados pela macro são IGNORADOS — só usamos as exportações
 * //   originais. As regras de negócio ficam gravadas aqui como comentários.
 *
 * // REGRA DE NEGÓCIO — CÁLCULOS (transpostos da planilha/macro):
 * //   MediaP13M = média ponderada dos 12 meses (exclui o mês corrente) com
 * //               pesos [3,3,1,1,1,1,1,1,1,1,3,3] ÷ 20.
 * //   CD  = MediaP13M ÷ 30
 * //   ES  = CD × 15
 * //   EM  = CD × Prazo
 * //   P.P = EM + ES
 * //   COMPRAR = se Estoque + Pedidos < P.P então teto(CD × 20) senão 0
 * //   Rescência = nº de meses com venda > 0 nos 3 últimos meses (exclui o mês corrente)
 * //   Nro Meses = nº de meses com venda > 0 nos 13 meses
 * //   Frequência = 1 (NroMeses ≤ 4), 2 (≤ 8), 3 (senão)
 * //   Nota ("Valor Total") = 3 se CustoTot13M ≥ 10.000, senão 0 (é uma NOTA do item na filial)
 * //   Classificação = "IMPORTANTE" se (Nota + Frequência + Rescência) ≥ 5
 * //   stockValue = Estoque × CustoUn13M (por filial)
 * //   coverageDays = stockValue ÷ (CustoTot13M ÷ 390); se CustoTot13M = 0 →
 * //                  9999 (se há estoque) ou 0
 * //   excessValue = máx(0; stockValue − (CustoTot13M ÷ 390) × dias da classe),
 * //                 com dias A:60 / B:90 / C:120
 * //   turnover (giro) = (CustoTot13M ÷ totalDias) × 360 ÷ stockValue;
 * //                 totalDias = 360 + dia do mês corrente (data de emissão no
 * //                 nome do arquivo); 0 se stockValue = 0
 * //   ABC por Filial+Tipo: ordena por CustoTot13M decrescente (em memória, sem
 * //                 reordenar a planilha), acumula e classifica A (≤80% do
 * //                 grupo), B (≤95%), C; se CustoTot13M ≤ 0 → C.
 * //   Refino C → D/E: se NroMeses = 0 e Última Compra ≥ emissão−180 → E;
 * //                 se NroMeses < 4 e Última Compra < emissão−180 → D; senão C.
 * //                 A/B passam direto.
 * //   PRAZO (09/09/2026): NÃO é lido da planilha — é cravado pelo comprador
 * //                 no sistema. Futuramente o portal calculará o lead time real
 * //                 por item/fornecedor/filial. Enquanto isso, Prazo = 0 e
 * //                 EM = CD × Prazo = 0 (P.P = ES).
 */

// ===========================================================================
// Constantes
// ===========================================================================

/** Filiais aceitas na análise (12 filiais). */
export const FILIAIS_ACEITAS = [
  '0101', '0102', '0103', '0106', '0107', '0108',
  '0301', '0303', '0304', '0305', '0306', '0307',
] as const;

/** Filiais ignoradas na análise (Indústria usa sempre a 0105; 0201 fora). */
export const FILIAIS_IGNORADAS = ['0105', '0201'] as const;

/** Dias máximos por classe para o Excedente (A/B/C definidos pelo usuário). */
export const DIAS_MAXIMOS = {
  A: 60,
  B: 90,
  C: 120,
  D: 180,
  E: 9999,
} as const;

/** Pesos da média ponderada dos 12 meses (exclui o mês corrente). */
export const PESOS_MEDIA_P13M = [3, 3, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3] as const;

/** Soma dos pesos (20). */
export const SOMA_PESOS_MEDIA_P13M = 20;

/** Dias considerados em 13 meses (13 × 30). */
export const DIAS_13_MESES = 390;

/** Limiares do ABC: A até 80%, B até 95%. */
export const ABC_LIMIAR_A = 0.8;
export const ABC_LIMIAR_B = 0.95;

/** Dias para reclassificação D/E (180 dias). */
export const DIAS_RECLASSIFICACAO = 180;

/** Tipos possíveis das classes da curva. */
export type ClasseCurva = 'A' | 'B' | 'C' | 'D' | 'E';

// ===========================================================================
// Normalização de códigos
// ===========================================================================

/** Normaliza um código removendo zeros à esquerda e preservando sufixos. */
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

// ===========================================================================
// Tipos
// ===========================================================================

/** Linha de compras já normalizada (entrada dos cálculos). */
export interface PurchaseRow {
  codigoOriginal: string;
  codigo: string;
  filial: string;
  descricao: string;
  familia: string;
  subFamilia: string;
  mrp: string;
  tipo: string;
  valores: number[];      // 13 meses, numéricos
  total: number;          // soma dos 13 meses
  // Campos lidos da exportação crua (09/09/2026)
  ultimaCompra: string;   // data (ISO YYYY-MM-DD) — coluna K
  qtd13M: number;         // Y
  custoUn13M: number;     // Z
  custoTot13M: number;    // AA
  prazo: number;          // NÃO lido (cravado pelo comprador) — sempre 0 por enquanto
  estoque: number;        // AF
  pedidos: number;        // AG
  // Campos calculados no código (09/09/2026)
  mediaP13M: number;
  cd: number;
  es: number;
  em: number;
  pp: number;
  comprar: number;
  rescencia: number;
  nroMeses: number;
  frequencia: number;
  nota: number;           // "Valor Total" = nota do item na filial
  classificacao: string;  // "IMPORTANTE" | ""
  stockValue: number;     // Estoque × CustoUn13M
  coverageDays: number;
  excessValue: number;
  turnover: number;
  classeMacro: ClasseCurva; // A/B/C da macro (Filial+Tipo)
  curva: ClasseCurva;       // ABCDE final
}

/** Informações da importação em uso (vêm do histórico de importações). */
export type ImportInfo = Record<string, unknown>;

/** Relatório de qualidade dos dados importados. */
export interface QualityReport {
  totalRegistros: number;
  filiaisPresentes: string[];
  totalFiliais: number;
  semDescricao: number;
  semFamilia: number;
  semSubFamilia: number;
  semMrp: number;
  semTipo: number;
}

/** Resumo por subfamília (usado no filtro do painel). */
export interface SubfamilySummary {
  subFamilia: string;
  filial: string;
  quantidadeItens: number;
  total: number;
  mediaP13M: number;
}

/** Registro da curva ABCDE por Filial + Tipo. */
export interface AbcRecord {
  filial: string;
  tipo: string;
  quantidadeItens: number;
  total: number;
  mediaP13M: number;
  diasCobertura: number;
  classe: ClasseCurva;
}

/** Resultado completo do dashboard ("entra e sai" da tela). */
export interface DashboardResult {
  currentImport: ImportInfo;
  quality: QualityReport;
  bySubfamily: SubfamilySummary[];
  abc: AbcRecord[];
}

// ===========================================================================
// Funções auxiliares
// ===========================================================================

/** Arredonda um número para 2 casas decimais. */
function arredondar(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** Filtra as linhas mantendo apenas as filiais aceitas. */
export function filtrarFiliaisAceitas(rows: PurchaseRow[]): PurchaseRow[] {
  const ignoradas = new Set<string>(FILIAIS_IGNORADAS);
  return rows.filter((r) => !ignoradas.has(r.filial));
}

/** Converte uma data ISO (YYYY-MM-DD) em Date (ou null). */
function dataDeIso(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Total de dias para o giro: 360 (12 meses) + dia do mês corrente.
 * O mês corrente é a data de emissão da planilha, contida no nome do arquivo.
 * Sem data de emissão, usa 13 meses × 30 = 390 (comportamento da macro).
 */
export function totalDiasGiro(emissao?: Date | null): number {
  if (emissao && !isNaN(emissao.getTime())) {
    return 360 + emissao.getDate();
  }
  return DIAS_13_MESES;
}

// ===========================================================================
// Cálculo dos campos de negócio
// ===========================================================================

/**
 * Calcula os campos derivados que NÃO dependem da classe (curva).
 * Roda logo após a leitura e o cruzamento com os cadastros.
 */
export function calcularCamposBase(rows: PurchaseRow[]): PurchaseRow[] {
  return rows.map((r) => {
    const valores = r.valores;
    // MediaP13M: média ponderada dos 12 meses (exclui o mês corrente, último).
    let somaPonderada = 0;
    for (let i = 0; i < 12; i++) {
      somaPonderada += (valores[i] ?? 0) * PESOS_MEDIA_P13M[i];
    }
    const mediaP13M = arredondar(somaPonderada / SOMA_PESOS_MEDIA_P13M);
    const cd = arredondar(mediaP13M / 30);
    const es = arredondar(cd * 15);
    const em = arredondar(cd * r.prazo); // prazo = 0 por enquanto (não lido)
    const pp = arredondar(em + es);
    const comprar = r.estoque + r.pedidos < pp ? Math.ceil(cd * 20) : 0;
    // Rescência: meses com venda > 0 nos 3 últimos meses (exclui o mês corrente).
    const rescencia = [valores[9], valores[10], valores[11]]
      .filter((v) => (v ?? 0) > 0).length;
    // Nro Meses: meses com venda > 0 nos 13 meses.
    const nroMeses = valores.filter((v) => (v ?? 0) > 0).length;
    const frequencia = nroMeses <= 4 ? 1 : nroMeses <= 8 ? 2 : 3;
    const nota = r.custoTot13M >= 10000 ? 3 : 0;
    const classificacao = nota + frequencia + rescencia >= 5 ? 'IMPORTANTE' : '';
    const stockValue = arredondar(r.estoque * r.custoUn13M);
    // Cobertura: stockValue ÷ (CustoTot13M ÷ 390); se consumo 0 → 9999 (se há estoque) ou 0.
    let coverageDays = 0;
    if (r.custoTot13M > 0) {
      coverageDays = Math.round(stockValue / (r.custoTot13M / DIAS_13_MESES));
    } else if (stockValue > 0) {
      coverageDays = 9999;
    }
    return {
      ...r,
      mediaP13M, cd, es, em, pp, comprar, rescencia, nroMeses,
      frequencia, nota, classificacao, stockValue, coverageDays,
    };
  });
}

/**
 * Calcula a classe ABC (macro) e a curva ABCDE final por Filial+Tipo.
 * Faz o agrupamento e a ordenação EM MEMÓRIA (não reordena a planilha).
 * Também calcula o Excedente (usa a classe A/B/C) e o Giro.
 */
export function calcularCurvasAbcde(rows: PurchaseRow[], emissao?: Date | null): PurchaseRow[] {
  // 1) Agrupa por Filial+Tipo (em memória).
  const grupos = new Map<string, PurchaseRow[]>();
  for (const r of rows) {
    const chave = `${r.filial}|${r.tipo || '(sem tipo)'}`;
    const lista = grupos.get(chave) ?? [];
    lista.push(r);
    grupos.set(chave, lista);
  }
  // 2) Para cada grupo, calcula total, acumulado e classe por item.
  const classeMacroPorItem = new Map<string, ClasseCurva>();
  const curvaPorItem = new Map<string, ClasseCurva>();
  const hoje = emissao ?? new Date();
  const limite180 = new Date(hoje.getTime() - DIAS_RECLASSIFICACAO * 86400000);

  for (const lista of grupos.values()) {
    const totalGrupo = lista.reduce((acc, r) => acc + r.custoTot13M, 0);
    const ordenados = [...lista].sort((a, b) => b.custoTot13M - a.custoTot13M);
    let acumulado = 0;
    for (const r of ordenados) {
      acumulado += r.custoTot13M;
      // Classe ABC da macro: C se consumo ≤ 0; senão A (≤80%), B (≤95%), C.
      let classe: ClasseCurva;
      if (r.custoTot13M <= 0) {
        classe = 'C';
      } else {
        const perc = totalGrupo > 0 ? acumulado / totalGrupo : 1;
        classe = perc <= ABC_LIMIAR_A ? 'A' : perc <= ABC_LIMIAR_B ? 'B' : 'C';
      }
      // Refino C → D/E (regra do usuário).
      let curva: ClasseCurva = classe;
      if (classe === 'C') {
        const ultima = dataDeIso(r.ultimaCompra);
        if (r.nroMeses === 0 && ultima && ultima >= limite180) {
          curva = 'E';
        } else if (r.nroMeses < 4 && r.nroMeses >= 0 && ultima && ultima < limite180) {
          curva = 'D';
        } else {
          curva = 'C';
        }
      }
      const chaveItem = `${r.codigo}|${r.filial}`;
      classeMacroPorItem.set(chaveItem, classe);
      curvaPorItem.set(chaveItem, curva);
    }
  }
  // 3) Aplica classe, curva, excedente e giro em cada linha.
  return rows.map((r) => {
    const chaveItem = `${r.codigo}|${r.filial}`;
    const classeMacro = classeMacroPorItem.get(chaveItem) ?? 'C';
    const curva = curvaPorItem.get(chaveItem) ?? 'C';
    // Excedente: máx(0; stockValue − (CustoTot13M ÷ 390) × dias da classe A/B/C).
    const diasClasse = DIAS_MAXIMOS[classeMacro];
    const excessValue = Math.max(0, r.stockValue - (r.custoTot13M / DIAS_13_MESES) * diasClasse);
    // Giro: (CustoTot13M ÷ totalDias) × 360 ÷ stockValue.
    const totalDias = totalDiasGiro(emissao);
    const turnover = r.stockValue > 0 ? ((r.custoTot13M / totalDias) * 360) / r.stockValue : 0;
    return {
      ...r,
      classeMacro,
      curva,
      excessValue: arredondar(excessValue),
      turnover: arredondar(turnover),
    };
  });
}

// ===========================================================================
// Consolidações do painel
// ===========================================================================

/** Consolida totais por subfamília (com filial) para o painel. */
export function calcularBySubfamily(rows: PurchaseRow[]): SubfamilySummary[] {
  const grupos = new Map<string, SubfamilySummary>();
  for (const r of rows) {
    const nome = r.subFamilia || '(sem subfamília)';
    const chave = `${r.filial}|${nome}`;
    const atual = grupos.get(chave) ?? {
      subFamilia: nome,
      filial: r.filial,
      quantidadeItens: 0,
      total: 0,
      mediaP13M: 0,
    };
    atual.quantidadeItens += 1;
    atual.total += r.custoTot13M;
    atual.mediaP13M += r.mediaP13M;
    grupos.set(chave, atual);
  }
  return Array.from(grupos.values())
    .map((g) => ({
      ...g,
      mediaP13M: arredondar(g.mediaP13M / g.quantidadeItens),
    }))
    .sort((a, b) => b.total - a.total);
}

/** Agrupa por Filial+Tipo e resume a curva ABCDE (para o painel). */
export function calcularAbcPorFilialTipo(rows: PurchaseRow[]): AbcRecord[] {
  const grupos = new Map<string, AbcRecord>();
  for (const r of rows) {
    const chave = `${r.filial}|${r.tipo || '(sem tipo)'}`;
    const atual = grupos.get(chave) ?? {
      filial: r.filial,
      tipo: r.tipo || '(sem tipo)',
      quantidadeItens: 0,
      total: 0,
      mediaP13M: 0,
      diasCobertura: 0,
      classe: 'C' as ClasseCurva,
    };
    atual.quantidadeItens += 1;
    atual.total += r.custoTot13M;
    atual.mediaP13M += r.mediaP13M;
    grupos.set(chave, atual);
  }
  return Array.from(grupos.values())
    .map((g) => ({
      ...g,
      mediaP13M: arredondar(g.mediaP13M / g.quantidadeItens),
      diasCobertura: g.quantidadeItens > 0 ? Math.round(g.total / g.quantidadeItens) : 0,
      classe: 'C' as ClasseCurva,
    }))
    .sort((a, b) => b.total - a.total);
}

/** Monta o relatório de qualidade dos dados importados. */
export function montarQualityReport(rows: PurchaseRow[]): QualityReport {
  const filiais = new Set(rows.map((r) => r.filial));
  return {
    totalRegistros: rows.length,
    filiaisPresentes: Array.from(filiais).sort(),
    totalFiliais: filiais.size,
    semDescricao: rows.filter((r) => !(r.descricao || '').trim()).length,
    semFamilia: rows.filter((r) => !(r.familia || '').trim()).length,
    semSubFamilia: rows.filter((r) => !(r.subFamilia || '').trim()).length,
    semMrp: rows.filter((r) => !(r.mrp || '').trim()).length,
    semTipo: rows.filter((r) => !(r.tipo || '').trim()).length,
  };
}

// ===========================================================================
// Função principal do dashboard
// ===========================================================================

/**
 * Calcula a média P13M, a curva ABCDE e as consolidações do dashboard.
 * As linhas já devem vir com os campos calculados (importação/pipeline).
 */
export function calculateMediaP13M(
  rows: PurchaseRow[],
  importInfo: ImportInfo = {},
): DashboardResult {
  // 1) Considera apenas as filiais aceitas (exclui 0105 e 0201)
  const aceitas = filtrarFiliaisAceitas(rows);
  // 2) Consolidações do painel
  const bySubfamily = calcularBySubfamily(aceitas);
  const abc = calcularAbcPorFilialTipo(aceitas);
  const quality = montarQualityReport(aceitas);
  // 3) Devolve tudo o que o dashboard precisa
  return {
    currentImport: importInfo,
    quality,
    bySubfamily,
    abc,
  };
}