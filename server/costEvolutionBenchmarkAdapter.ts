import { buildCostBenchmarkReport, type CostBenchmarkReport } from "./costBenchmarkReport";
import { calculateWeightedMonthlyCost, type WeightedCostAggregate } from "./costWeightedMonthly";
import type { CostBenchmarkInput } from "./costBenchmarkRules";
import { curveLookupKey } from "./costCurveLookup";
type Curve = CostBenchmarkInput["curve"];
type MonthlyCost = {
  period: string;
  custo_medio: number | null;
  /** Autopeças: quantidade vendida do agregado no mês. */
  quantidade_vendida?: number | null;
  /** Indústria: valor consumido do agregado no mês. */
  valor_consumo?: number | null;
};
type EvolutionItem = {
  codigo: string;
  descricao?: string;
  filial?: string;
  cod_agregado?: string | null;
  curve?: Curve;
  costStatus?: "COM_BASE" | "SEM_BASE_CUSTO" | "CURVA_NAO_VINCULADA";
  meses: MonthlyCost[];
  quantidade?: number | null;
};
type CurveLookup = Record<string, Curve>;
type EvolutionAnalysis = {
  periodos?: { period: string }[];
  items?: EvolutionItem[];
  [key: string]: unknown;
};
type CostSegment = "auto_parts" | "industry";
const keyFor = curveLookupKey;
const findCurve = (curves: CurveLookup, branch: string | undefined, code: string) =>
  curves[keyFor(branch, code)] ?? curves[`${branch ?? ""}|${code}`];
function carryForward(item: EvolutionItem, periods: string[]) {
  const values = new Map(item.meses.map(entry => [entry.period, entry.custo_medio]));
  let previous: number | null = null;
  return periods.map(period => {
    const current = values.get(period);
    if (current != null && current !== 0) previous = current;
    return previous;
  });
}
function toCalendarPeriod(period: string): string | null {
  const normalized = period.replace(/[^0-9]/g, "");
  if (/^\d{6}$/.test(normalized)) return normalized;
  if (/^\d{8}$/.test(normalized)) return normalized.slice(0, 6);
  return null;
}
function buildWeightedAggregate(item: EvolutionItem, curve: Exclude<Curve, "SEM_CURVA">, segment: CostSegment): WeightedCostAggregate {
  const monthlyCosts: Record<string, number | null> = {};
  const monthlyWeights: Record<string, number | null> = {};
  for (const month of item.meses) {
    const period = toCalendarPeriod(month.period);
    if (!period) continue;
    monthlyCosts[period] = month.custo_medio;
    // Não usar quantidade do cadastro nem qualquer total genérico como peso.
    // Os pesos aprovados são mensais e específicos de cada segmento.
    monthlyWeights[period] = segment === "auto_parts"
      ? month.quantidade_vendida ?? null
      : month.valor_consumo ?? null;
  }
  return {
    branch: item.filial ?? "",
    aggregateCode: item.cod_agregado ?? item.codigo,
    curve: curve as "A" | "B" | "C" | "D" | "E",
    monthlyCosts,
    monthlyWeights,
  };
}
/**
 * Cruza a resposta mensal da evolução com a curva ABC já carregada.
 * A função não consulta banco, não altera registros e mantém o payload original.
 */
export function attachCostBenchmarkReport(
  analysis: EvolutionAnalysis,
  curves: CurveLookup,
  segment: CostSegment,
  benchmarks: Partial<Record<"IPCA" | "IGPM" | "DOLAR_PTAX", number>> = {},
): EvolutionAnalysis & { benchmarkReport: CostBenchmarkReport } {
  const periods = (analysis.periodos ?? []).map(entry => entry.period).sort();
  const inputs: CostBenchmarkInput[] = [];
  const eligibleItems: EvolutionItem[] = [];
  const weightedAggregates: WeightedCostAggregate[] = [];
  for (const item of analysis.items ?? []) {
    const series = carryForward(item, periods).filter((value): value is number => value != null);
    if (series.length === 0) {
      item.costStatus = "SEM_BASE_CUSTO";
      continue;
    }
    // A classificação gerencial é do agregado. O código individual só é
    // fallback para fontes legadas que não trazem o agregado.
    const curve = (item.cod_agregado ? findCurve(curves, item.filial, item.cod_agregado) : undefined)
      ?? findCurve(curves, item.filial, item.codigo)
      ?? "SEM_CURVA";
    if (curve === "SEM_CURVA") {
      item.costStatus = "CURVA_NAO_VINCULADA";
      continue;
    }
    item.costStatus = "COM_BASE";
    item.curve = curve;
    eligibleItems.push(item);
    inputs.push({
      productCode: item.codigo,
      description: item.descricao,
      branchCode: item.filial,
      curve,
      costStart: series[0],
      costEnd: series[series.length - 1],
      quantity: item.quantidade ?? undefined,
      weight: item.quantidade ?? undefined,
    });
    weightedAggregates.push(buildWeightedAggregate(item, curve, segment));
  }
  const benchmarkReport = buildCostBenchmarkReport({ segment, items: inputs, benchmarks });
  const weighted = calculateWeightedMonthlyCost({
    segment,
    periods,
    aggregates: weightedAggregates,
  });
  benchmarkReport.weightedMonthlyVariationPercent = weighted.total.weight > 0
    ? Number(weighted.total.weightedVariationPercent.toFixed(4))
    : null;
  for (const [curve, summary] of Object.entries(weighted.byCurve)) {
    const target = benchmarkReport.byCurve[curve as keyof typeof benchmarkReport.byCurve];
    if (target && summary.weight > 0) {
      target.weightedVariationPercent = Number(summary.weightedVariationPercent.toFixed(4));
      target.weight = Number(summary.weight.toFixed(4));
      target.weightedAggregates = summary.aggregates;
    }
  }
  // Impacto e inflação interna aguardam uma base financeira homologada.
  benchmarkReport.internalInflationPercent = 0;
  for (const summary of Object.values(benchmarkReport.byCurve)) summary.estimatedImpact = 0;
  // MUDANÇA (17/10/2026): devolve TODOS os itens da análise, mantendo os
  // marcadores COM_BASE / SEM_BASE_CUSTO / CURVA_NAO_VINCULADA gravados acima.
  // Antes só os elegíveis voltavam — itens sem curva/sem base desapareciam
  // da tabela "Evolução mês a mês por item" (na Indústria, esvaziava tudo).
  return { ...analysis, benchmarkReport };
}