import { describe, expect, it } from "vitest";
import { attachCostBenchmarkReport } from "./costEvolutionBenchmarkAdapter";

describe("cost evolution benchmark adapter", () => {
  it("carries the last valid cost and groups the item by its ABC curve", () => {
    const result = attachCostBenchmarkReport({
      periodos: [{ period: "202501" }, { period: "202502" }, { period: "202503" }],
      items: [{
        codigo: "P-1",
        descricao: "Item A",
        filial: "0101",
        meses: [
          { period: "202501", custo_medio: 100 },
          { period: "202502", custo_medio: null },
          { period: "202503", custo_medio: 120 },
        ],
      }],
    }, { "0101|P-1": "A" }, "auto_parts", { IPCA: 5 });

    expect(result.items?.[0]).toMatchObject({ codigo: "P-1", curve: "A" });
    expect(result.benchmarkReport.countsByCurve.A).toBe(1);
    expect(result.benchmarkReport.items[0]).toMatchObject({ costStart: 100, costEnd: 120, curve: "A" });
    expect(result.benchmarkReport.items[0].benchmarkVariationPercent.IPCA).toBe(5);
  });

  it("keeps items without a matching ABC record visible as SEM_CURVA", () => {
    const result = attachCostBenchmarkReport({
      periodos: [{ period: "202501" }, { period: "202502" }],
      items: [{ codigo: "P-2", filial: "0102", meses: [{ period: "202501", custo_medio: 50 }, { period: "202502", custo_medio: 55 }] }],
    }, {}, "industry");

    expect(result.benchmarkReport.countsByCurve.SEM_CURVA).toBe(1);
    expect(result.benchmarkReport.items[0].reasons).toContain("item_sem_curva_abc");
  });
});
