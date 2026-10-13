import {
  calculateInternalInflation,
  enrichCostWithBenchmarks,
  type CostBenchmarkInput,
  type CostBenchmarkResult,
  type EconomicIndexKind,
} from "./costBenchmarkRules";

export type CostBenchmarkReportInput = {
  segment: "auto_parts" | "industry";
  items: CostBenchmarkInput[];
  benchmarks: Partial<Record<EconomicIndexKind, number>>;
  topN?: number;
};

export type CostBenchmarkReport = {
  segment: CostBenchmarkReportInput["segment"];
  internalInflationPercent: number | null;
  items: CostBenchmarkResult[];
  topIncreases: CostBenchmarkResult[];
  topReductions: CostBenchmarkResult[];
  countsByAlert: Record<CostBenchmarkResult["alert"], number>;
  countsByCurve: Record<CostBenchmarkInput["curve"], number>;
  byCurve: Record<CostBenchmarkInput["curve"], CurveCostSummary>;
};

export type CurveCostSummary = {
  itemCount: number;
  itemsWithBase: number;
  averageVariationPercent: number | null;
  totalCostStart: number;
  totalCostEnd: number;
  estimatedImpact: number | null;
  highAlerts: number;
};

export function buildCostBenchmarkReport(input: CostBenchmarkReportInput): CostBenchmarkReport {
  const items = input.items.map((item) => enrichCostWithBenchmarks(item, input.benchmarks));
  const ranked = items.filter((item) => item.costVariationPercent !== null);
  const topN = Math.max(1, Math.min(100, input.topN ?? 10));
  const topIncreases = [...ranked]
    .sort((a, b) => (b.costVariationPercent ?? -Infinity) - (a.costVariationPercent ?? -Infinity))
    .slice(0, topN);
  const topReductions = [...ranked]
    .sort((a, b) => (a.costVariationPercent ?? Infinity) - (b.costVariationPercent ?? Infinity))
    .slice(0, topN);
  const countsByAlert = { ALTA: 0, ATENCAO: 0, NORMAL: 0, SEM_BASE: 0 } as Record<CostBenchmarkResult["alert"], number>;
  const countsByCurve = { A: 0, B: 0, C: 0, D: 0, E: 0, SEM_CURVA: 0 } as Record<CostBenchmarkInput["curve"], number>;
  const byCurve = Object.fromEntries(Object.keys(countsByCurve).map((curve) => [curve, {
    itemCount: 0,
    itemsWithBase: 0,
    averageVariationPercent: null,
    totalCostStart: 0,
    totalCostEnd: 0,
    estimatedImpact: null,
    highAlerts: 0,
  }])) as Record<CostBenchmarkInput["curve"], CurveCostSummary>;
  const variationSums = Object.fromEntries(Object.keys(countsByCurve).map((curve) => [curve, 0])) as Record<CostBenchmarkInput["curve"], number>;
  for (const item of items) {
    countsByAlert[item.alert] += 1;
    countsByCurve[item.curve] += 1;
    const summary = byCurve[item.curve];
    summary.itemCount += 1;
    if (item.costVariationPercent !== null) {
      summary.itemsWithBase += 1;
      variationSums[item.curve] += item.costVariationPercent;
    }
    const quantity = Number.isFinite(item.quantity) && (item.quantity ?? 0) > 0 ? item.quantity! : 1;
    summary.totalCostStart += item.costStart * quantity;
    summary.totalCostEnd += item.costEnd * quantity;
    if (item.alert === "ALTA") summary.highAlerts += 1;
  }
  for (const curve of Object.keys(byCurve) as CostBenchmarkInput["curve"][]) {
    const summary = byCurve[curve];
    summary.averageVariationPercent = summary.itemsWithBase > 0
      ? Number((variationSums[curve] / summary.itemsWithBase).toFixed(4))
      : null;
    summary.totalCostStart = Number(summary.totalCostStart.toFixed(2));
    summary.totalCostEnd = Number(summary.totalCostEnd.toFixed(2));
    summary.estimatedImpact = summary.itemsWithBase > 0
      ? Number((summary.totalCostEnd - summary.totalCostStart).toFixed(2))
      : null;
  }
  return {
    segment: input.segment,
    internalInflationPercent: calculateInternalInflation(input.items),
    items,
    topIncreases,
    topReductions,
    countsByAlert,
    countsByCurve,
    byCurve,
  };
}
