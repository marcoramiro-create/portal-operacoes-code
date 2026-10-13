import { describe, expect, it } from "vitest";
import {
  calculateInternalInflation,
  enrichCostWithBenchmarks,
  percentVariation,
  summarizeEconomicIndex,
} from "./costBenchmarkRules";

describe("costBenchmarkRules", () => {
  it("calcula variação percentual sem aceitar base inválida", () => {
    expect(percentVariation(100, 115)).toBe(15);
    expect(percentVariation(0, 10)).toBeNull();
  });

  it("resume índice econômico por período", () => {
    expect(summarizeEconomicIndex("IPCA", [
      { period: "2026-02", value: 100 },
      { period: "2026-01", value: 98 },
      { period: "2026-03", value: 102 },
    ])).toMatchObject({
      startPeriod: "2026-01",
      endPeriod: "2026-03",
      variationPercent: expect.closeTo(4.0816, 4),
      observations: 3,
    });
  });

  it("calcula inflação interna ponderada pelo custo quando não há peso explícito", () => {
    expect(calculateInternalInflation([
      { costStart: 100, costEnd: 110 },
      { costStart: 300, costEnd: 315 },
    ])).toBe(6.25);
  });

  it("cruza item com IPCA e marca variação alta para curva A", () => {
    const result = enrichCostWithBenchmarks({
      productCode: "P-1",
      curve: "A",
      costStart: 100,
      costEnd: 125,
    }, { IPCA: 4, IGPM: 5 });
    expect(result.alert).toBe("ALTA");
    expect(result.realVariationPercent.IPCA).toBe(21);
    expect(result.reasons).toContain("custo_acima_do_ipca");
  });

  it("mantém item sem histórico como sem base", () => {
    expect(enrichCostWithBenchmarks({
      productCode: "P-2",
      curve: "C",
      costStart: 0,
      costEnd: 100,
    }, {}).alert).toBe("SEM_BASE");
  });
});
