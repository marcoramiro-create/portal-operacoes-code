export type WeightedCostSegment = "auto_parts" | "industry";
export type WeightedCurve = "A" | "B" | "C" | "D" | "E";

export interface WeightedCostAggregate {
  branch: string;
  aggregateCode: string;
  curve: WeightedCurve;
  monthlyCosts: Record<string, number | null | undefined>;
  monthlyWeights: Record<string, number | null | undefined>;
}

export interface WeightedMonthlyPoint {
  period: string;
  cost: number | null;
  weight: number | null;
  variationPercent: number | null;
  includedInWeight: boolean;
}

export interface WeightedAggregateResult {
  branch: string;
  aggregateCode: string;
  curve: WeightedCurve;
  points: WeightedMonthlyPoint[];
}

export interface WeightedMonthlyResult {
  segment: WeightedCostSegment;
  periods: string[];
  aggregates: WeightedAggregateResult[];
  byCurve: Record<string, { weightedVariationPercent: number; weight: number; aggregates: number }>;
  total: { weightedVariationPercent: number; weight: number; aggregates: number };
  eligibleAggregates: number;
  excluded: {
    noPositiveCostInPeriod: number;
    missingWeight: number;
    missingCurve: number;
  };
}

function finitePositive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function isPeriod(value: string): boolean {
  return /^\d{6}$/.test(value) && Number(value.slice(4, 6)) >= 1 && Number(value.slice(4, 6)) <= 12;
}

function nextPeriod(period: string): string {
  let year = Number(period.slice(0, 4));
  let month = Number(period.slice(4, 6));
  if (month === 12) {
    year += 1;
    month = 1;
  } else {
    month += 1;
  }
  return `${year}${String(month).padStart(2, "0")}`;
}

/** Materializa todos os meses entre o menor e o maior período selecionado. */
export function materializeCalendarMonths(periods: string[]): string[] {
  const valid = [...new Set(periods.filter(isPeriod))].sort();
  if (valid.length === 0) return [];

  const result: string[] = [];
  let current = valid[0];
  const end = valid[valid.length - 1];
  while (current <= end) {
    result.push(current);
    if (current === end) break;
    current = nextPeriod(current);
  }
  return result;
}

function carryCosts(
  costs: Record<string, number | null | undefined>,
  periods: string[],
): Array<number | null> {
  let last: number | null = null;
  return periods.map(period => {
    const observed = finitePositive(costs[period]);
    if (observed != null) last = observed;
    return last;
  });
}

function emptySummary() {
  return { weightedVariationPercent: 0, weight: 0, aggregates: 0 };
}

export function calculateWeightedMonthlyCost(input: {
  segment: WeightedCostSegment;
  /** Pode conter lacunas; o intervalo mínimo/máximo será materializado. */
  periods: string[];
  aggregates: WeightedCostAggregate[];
}): WeightedMonthlyResult {
  const periods = materializeCalendarMonths(input.periods);
  const byCurve: Record<string, { weightedVariationPercent: number; weight: number; aggregates: number }> = {};
  for (const curve of input.segment === "industry" ? ["A", "B", "C"] : ["A", "B", "C", "D", "E"]) {
    byCurve[curve] = emptySummary();
  }

  let totalNumerator = 0;
  let totalWeight = 0;
  let eligibleAggregates = 0;
  const excluded = { noPositiveCostInPeriod: 0, missingWeight: 0, missingCurve: 0 };
  const aggregateResults: WeightedAggregateResult[] = [];

  for (const aggregate of input.aggregates) {
    if (!byCurve[aggregate.curve]) {
      excluded.missingCurve += 1;
      continue;
    }

    const carriedCosts = carryCosts(aggregate.monthlyCosts, periods);
    if (!carriedCosts.some(cost => cost != null)) {
      excluded.noPositiveCostInPeriod += 1;
      continue;
    }

    let numerator = 0;
    let weightTotal = 0;
    const points: WeightedMonthlyPoint[] = periods.map((period, index) => {
      const current = carriedCosts[index];
      const previous = index === 0 ? null : carriedCosts[index - 1];
      const weight = finiteNonNegative(aggregate.monthlyWeights[period]);
      const variationPercent =
        index > 0 && previous != null && current != null
          ? ((current - previous) / previous) * 100
          : null;
      const includedInWeight = variationPercent != null && weight != null && weight > 0;
      if (includedInWeight) {
        numerator += variationPercent * weight;
        weightTotal += weight;
      }
      return { period, cost: current, weight, variationPercent, includedInWeight };
    });

    aggregateResults.push({
      branch: aggregate.branch,
      aggregateCode: aggregate.aggregateCode,
      curve: aggregate.curve,
      points,
    });

    if (weightTotal <= 0) {
      excluded.missingWeight += 1;
      continue;
    }

    const summary = byCurve[aggregate.curve];
    summary.weightedVariationPercent += numerator;
    summary.weight += weightTotal;
    summary.aggregates += 1;
    totalNumerator += numerator;
    totalWeight += weightTotal;
    eligibleAggregates += 1;
  }

  for (const summary of Object.values(byCurve)) {
    if (summary.weight > 0) summary.weightedVariationPercent /= summary.weight;
  }

  return {
    segment: input.segment,
    periods,
    aggregates: aggregateResults,
    byCurve,
    total: {
      weightedVariationPercent: totalWeight > 0 ? totalNumerator / totalWeight : 0,
      weight: totalWeight,
      aggregates: eligibleAggregates,
    },
    eligibleAggregates,
    excluded,
  };
}
