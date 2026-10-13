import { buildCostBenchmarkReport, type CostBenchmarkReport } from "./costBenchmarkReport";
import type { CostBenchmarkInput } from "./costBenchmarkRules";

type Curve = CostBenchmarkInput["curve"];

type MonthlyCost = { period: string; custo_medio: number | null };

type EvolutionItem = {
  codigo: string;
  descricao?: string;
  filial?: string;
  cod_agregado?: string | null;
  curve?: Curve;
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

const keyFor = (branch: string | undefined, code: string) => `${branch ?? ""}|${code}`;

function carryForward(item: EvolutionItem, periods: string[]) {
  const values = new Map(item.meses.map(entry => [entry.period, entry.custo_medio]));
  let previous: number | null = null;
  return periods.map(period => {
    const current = values.get(period);
    if (current != null && current !== 0) previous = current;
    return previous;
  });
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

  for (const item of analysis.items ?? []) {
    const series = carryForward(item, periods).filter((value): value is number => value != null);
    if (series.length === 0) continue;
    const curve = item.curve
      ?? curves[keyFor(item.filial, item.codigo)]
      ?? (item.cod_agregado ? curves[keyFor(item.filial, item.cod_agregado)] : undefined)
      ?? "SEM_CURVA";
    item.curve = curve;
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
  }

  const benchmarkReport = buildCostBenchmarkReport({
    segment,
    items: inputs,
    benchmarks,
  });
  return { ...analysis, benchmarkReport };
}
