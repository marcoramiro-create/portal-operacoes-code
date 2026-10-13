export type EconomicIndexKind = "IPCA" | "IGPM" | "DOLAR_PTAX" | "INFLACAO_INTERNA";

export type MonthlyEconomicObservation = {
  period: string;
  value: number;
};

export type CostBenchmarkInput = {
  productCode: string;
  description?: string;
  branchCode?: string;
  curve: "A" | "B" | "C" | "D" | "E" | "SEM_CURVA";
  costStart: number;
  costEnd: number;
  weight?: number;
};

export type CostBenchmarkResult = CostBenchmarkInput & {
  costVariationPercent: number | null;
  benchmarkVariationPercent: Partial<Record<EconomicIndexKind, number>>;
  realVariationPercent: Partial<Record<EconomicIndexKind, number>>;
  alert: "ALTA" | "ATENCAO" | "NORMAL" | "SEM_BASE";
  reasons: string[];
};

export type EconomicIndexSummary = {
  kind: EconomicIndexKind;
  startPeriod: string | null;
  endPeriod: string | null;
  startValue: number | null;
  endValue: number | null;
  variationPercent: number | null;
  observations: number;
};

const finitePositive = (value: number) => Number.isFinite(value) && value > 0;

export function percentVariation(start: number, end: number): number | null {
  if (!finitePositive(start) || !Number.isFinite(end)) return null;
  return Number((((end - start) / start) * 100).toFixed(4));
}

export function summarizeEconomicIndex(
  kind: EconomicIndexKind,
  observations: MonthlyEconomicObservation[],
): EconomicIndexSummary {
  const valid = observations
    .filter((entry) => entry.period && Number.isFinite(entry.value) && entry.value >= 0)
    .sort((a, b) => a.period.localeCompare(b.period));
  const first = valid[0];
  const last = valid[valid.length - 1];
  return {
    kind,
    startPeriod: first?.period ?? null,
    endPeriod: last?.period ?? null,
    startValue: first?.value ?? null,
    endValue: last?.value ?? null,
    variationPercent: first && last ? percentVariation(first.value, last.value) : null,
    observations: valid.length,
  };
}

export function calculateInternalInflation(
  items: Array<{ costStart: number; costEnd: number; weight?: number }>,
): number | null {
  const valid = items.filter((item) => finitePositive(item.costStart) && Number.isFinite(item.costEnd));
  if (valid.length === 0) return null;
  const totalWeight = valid.reduce((sum, item) => sum + (finitePositive(item.weight ?? 0) ? item.weight! : item.costStart), 0);
  if (!finitePositive(totalWeight)) return null;
  const weighted = valid.reduce((sum, item) => {
    const weight = finitePositive(item.weight ?? 0) ? item.weight! : item.costStart;
    const variation = percentVariation(item.costStart, item.costEnd) ?? 0;
    return sum + variation * (weight / totalWeight);
  }, 0);
  return Number(weighted.toFixed(4));
}

function alertFor(curve: CostBenchmarkInput["curve"], variation: number | null): CostBenchmarkResult["alert"] {
  if (variation === null) return "SEM_BASE";
  const limit = curve === "A" ? 10 : curve === "B" ? 15 : 20;
  if (Math.abs(variation) >= limit) return "ALTA";
  if (Math.abs(variation) >= limit / 2) return "ATENCAO";
  return "NORMAL";
}

export function enrichCostWithBenchmarks(
  input: CostBenchmarkInput,
  benchmarks: Partial<Record<EconomicIndexKind, number>>,
): CostBenchmarkResult {
  const costVariationPercent = percentVariation(input.costStart, input.costEnd);
  const realVariationPercent: CostBenchmarkResult["realVariationPercent"] = {};
  const reasons: string[] = [];
  for (const [kind, variation] of Object.entries(benchmarks) as Array<[EconomicIndexKind, number]>) {
    if (costVariationPercent !== null && Number.isFinite(variation)) {
      realVariationPercent[kind] = Number((costVariationPercent - variation).toFixed(4));
    }
  }
  const alert = alertFor(input.curve, costVariationPercent);
  if (input.curve === "SEM_CURVA") reasons.push("item_sem_curva_abc");
  if (alert === "ALTA") reasons.push("variacao_relevante_para_a_curva");
  if (costVariationPercent !== null && benchmarks.IPCA !== undefined && costVariationPercent > benchmarks.IPCA) {
    reasons.push("custo_acima_do_ipca");
  }
  if (costVariationPercent !== null && benchmarks.IGPM !== undefined && costVariationPercent > benchmarks.IGPM) {
    reasons.push("custo_acima_do_igpm");
  }
  return { ...input, costVariationPercent, benchmarkVariationPercent: benchmarks, realVariationPercent, alert, reasons };
}
