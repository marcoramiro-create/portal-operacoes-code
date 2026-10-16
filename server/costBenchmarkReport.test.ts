import { describe, expect, it } from "vitest";
import { buildCostBenchmarkReport } from "./costBenchmarkReport";

describe("costBenchmarkReport", () => {
  it("classifica alertas, curva e rankings sem misturar segmentos", () => {
    const report = buildCostBenchmarkReport({
      segment: "auto_parts",
      benchmarks: { IPCA: 4 },
      topN: 2,
      items: [
        { productCode: "A", curve: "A", costStart: 100, costEnd: 130, quantity: 10 },
        { productCode: "B", curve: "B", costStart: 200, costEnd: 180 },
        { productCode: "C", curve: "C", costStart: 0, costEnd: 10 },
      ],
    });
    expect(report.segment).toBe("auto_parts");
    expect(report.topIncreases.map((item) => item.productCode)).toEqual(["A", "B"]);
    expect(report.topReductions.map((item) => item.productCode)).toEqual(["B", "A"]);
    expect(report.countsByAlert.SEM_BASE).toBe(1);
    expect(report.countsByCurve.A).toBe(1);
    expect(report.byCurve.A.estimatedImpact).toBe(300);
    expect(report.byCurve.A.highAlerts).toBe(1);
    expect(report.internalInflationPercent).toBe(3.3333);
  });

  it("exclui da Indústria itens sem curva e curvas fora de ABC", () => {
    const report = buildCostBenchmarkReport({
      segment: "industry",
      benchmarks: {},
      topN: 1,
      items: [
        { productCode: "X", curve: "SEM_CURVA", costStart: 100, costEnd: 110 },
        { productCode: "Y", curve: "D", costStart: 100, costEnd: 90 },
      ],
    });
    expect(report.topIncreases).toHaveLength(0);
    expect(report.topReductions).toHaveLength(0);
    expect(report.items).toHaveLength(0);
    expect(report.countsByCurve.SEM_CURVA).toBe(0);
    expect(report.countsByCurve.D).toBe(0);
  });
});
