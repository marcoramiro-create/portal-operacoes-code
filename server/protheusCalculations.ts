/**
 * protheusCalculations.ts
 * Cálculos de média P13M, curva ABCDE e consolidações do painel de operações.
 * Módulo: server (API tRPC)
 * Data: 07/09/2026
 * // MUDANÇA (07/09/2026): reentrega do arquivo COMPLETO em bloco único, com
 * //   normalizeCode local, lookups pelo código normalizado, agrupamento ABC
 * //   por Filial + Tipo, curva A-E e DIAS_MAXIMOS A:60 / B:90 / C:120.
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

/** Dias máximos por classe da curva ABCDE (A/B/C definidos pelo usuário). */
export const DIAS_MAXIMOS = {
  A: 60,
  B: 90,
  C: 120,
  D: 180,  // padrão adotado (o usuário definiu apenas A, B e C)
  E: 9999, // classe E: tudo acima de D
} as const;

/** Tipos possíveis das classes da curva. */
export type ClasseCurva = 'A' | 'B' | 'C' | 'D' | 'E';

// ===========================================================================
// Normalização de códigos
// ===========================================================================

/**
 * Normaliza um código removendo zeros à esquerda da parte numérica e
 * preservando sufixos ("00004" -> "4", "00006-MGT" -> "6-MGT").
 * // MUDANÇA (07/09/2026): função LOCAL deste arquivo (não importa de outros).
 */
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
  codigoOriginal: string; // código como veio da planilha
  codigo: string;         // código normalizado
  filial: string;         // filial com 4 dígitos
  descricao: string;      // descrição do item
  familia: string;        // descrição da família (via cadastro Famílias)
  subFamilia: string;     // descrição da subfamília (via cadastro SubFamílias)
  mrp: string;            // "Sim" | "Não" (vindo do SBZ)
  tipo: string;           // tipo do item (ABC por Filial + Tipo)
  valores: number[];      // 13 meses, numéricos (NÃO normalizados)
  total: number;          // soma dos 13 meses
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

/** Calcula a média mensal a partir da soma dos 13 meses. */
function media13(soma: number): number {
  return arredondar(soma / 13);
}

/** Filtra as linhas mantendo apenas as filiais aceitas. */
export function filtrarFiliaisAceitas(rows: PurchaseRow[]): PurchaseRow[] {
  const ignoradas = new Set<string>(FILIAIS_IGNORADAS);
  return rows.filter((r) => !ignoradas.has(r.filial));
}

/** Classifica a classe A-E comparando os dias de cobertura com os DIAS_MAXIMOS. */
export function classificarClasse(diasCobertura: number): ClasseCurva {
  if (diasCobertura <= DIAS_MAXIMOS.A) return 'A';
  if (diasCobertura <= DIAS_MAXIMOS.B) return 'B';
  if (diasCobertura <= DIAS_MAXIMOS.C) return 'C';
  if (diasCobertura <= DIAS_MAXIMOS.D) return 'D';
  return 'E';
}

/** Agrupa as linhas por Filial + Tipo e monta a curva ABCDE. */
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
      classe: 'E' as ClasseCurva,
    };
    atual.quantidadeItens += 1;
    atual.total += r.total;
    grupos.set(chave, atual);
  }
  // dias de cobertura usa a média mensal do grupo (regra definida pelo usuário)
  return Array.from(grupos.values())
    .map((g) => {
      const mediaMensal = media13(g.total);
      const diasCobertura = Math.round(mediaMensal);
      return { ...g, mediaP13M: mediaMensal, diasCobertura, classe: classificarClasse(diasCobertura) };
    })
    .sort((a, b) => b.total - a.total);
}

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
    atual.total += r.total;
    grupos.set(chave, atual);
  }
  return Array.from(grupos.values())
    .map((g) => ({ ...g, mediaP13M: media13(g.total) }))
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
// Função principal
// ===========================================================================

/**
 * Calcula a média P13M, a curva ABCDE e as consolidações do dashboard.
 * // MUDANÇA (07/09/2026): função única e completa — a versão anterior foi
 * //   colada em duas partes e ficou com calculateMediaP13M duplicada/aberta.
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