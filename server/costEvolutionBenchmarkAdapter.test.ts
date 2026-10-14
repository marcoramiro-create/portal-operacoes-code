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

  it("excludes items without a matching ABC record", () => {
    const result = attachCostBenchmarkReport({
      periodos: [{ period: "202501" }, { period: "202502" }],
      items: [{ codigo: "P-2", filial: "0102", meses: [{ period: "202501", custo_medio: 50 }, { period: "202502", custo_medio: 55 }] }],
    }, {}, "industry");

    expect(result.items).toHaveLength(0);
    expect(result.benchmarkReport.countsByCurve.SEM_CURVA).toBe(0);
    expect(result.benchmarkReport.items).toHaveLength(0);
  });

  it("falls back to the aggregate code used by the Compras ABCDE import", () => {
    const result = attachCostBenchmarkReport({
      periodos: [{ period: "202501" }, { period: "202502" }],
      items: [{
        codigo: "PROD-01",
        cod_agregado: "AGR-01",
        filial: "0101",
        meses: [{ period: "202501", custo_medio: 50 }, { period: "202502", custo_medio: 55 }],
      }],
    }, { "0101|AGR-01": "B" }, "auto_parts");

    expect(result.items?.[0]).toMatchObject({ curve: "B" });
    expect(result.benchmarkReport.countsByCurve.B).toBe(1);
  });

  it("prioritizes the branch plus aggregate code over the individual product code", () => {
    const result = attachCostBenchmarkReport({
      periodos: [{ period: "202501" }, { period: "202502" }],
      items: [{
        codigo: "PROD-01",
        cod_agregado: "AGR-01",
        filial: "0101",
        meses: [{ period: "202501", custo_medio: 50 }, { period: "202502", custo_medio: 55 }],
      }],
    }, {
      "0101|PROD-01": "D",
      "0101|AGR-01": "A",
    }, "auto_parts");

    expect(result.items?.[0]).toMatchObject({ curve: "A" });
    expect(result.benchmarkReport.countsByCurve.A).toBe(1);
    expect(result.benchmarkReport.countsByCurve.D).toBe(0);
  });

  it("marks zero-only items as sem base and excludes them from ABC alerts", () => {
    const result = attachCostBenchmarkReport({
      periodos: [{ period: "202501" }, { period: "202502" }],
      items: [{
        codigo: "07387",
        cod_agregado: "07387",
        filial: "0105",
        meses: [{ period: "202501", custo_medio: 0 }, { period: "202502", custo_medio: null }],
      }],
    }, { "0105|07387": "A" }, "industry");

    expect(result.items).toHaveLength(0);
    expect(result.benchmarkReport.items).toHaveLength(0);
    expect(result.benchmarkReport.countsByCurve.A).toBe(0);
    expect(result.benchmarkReport.countsByAlert.SEM_BASE).toBe(0);
    expect(result.benchmarkReport.internalInflationPercent).toBe(0);
  });
});
