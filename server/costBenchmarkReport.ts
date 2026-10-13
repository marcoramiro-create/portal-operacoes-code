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
  for (const item of items) {
    countsByAlert[item.alert] += 1;
    countsByCurve[item.curve] += 1;
  }
  return {
    segment: input.segment,
    internalInflationPercent: calculateInternalInflation(input.items),
    items,
    topIncreases,
    topReductions,
    countsByAlert,
    countsByCurve,
  };
}
