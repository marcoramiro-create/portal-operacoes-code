import { describe, expect, it } from "vitest";
import { buildCostBenchmarkReport } from "./costBenchmarkReport";

describe("costBenchmarkReport", () => {
  it("classifica alertas, curva e rankings sem misturar segmentos", () => {
    const report = buildCostBenchmarkReport({
      segment: "auto_parts",
      benchmarks: { IPCA: 4 },
      topN: 2,
      items: [
        { productCode: "A", curve: "A", costStart: 100, costEnd: 130 },
        { productCode: "B", curve: "B", costStart: 200, costEnd: 180 },
        { productCode: "C", curve: "C", costStart: 0, costEnd: 10 },
      ],
    });
    expect(report.segment).toBe("auto_parts");
    expect(report.topIncreases.map((item) => item.productCode)).toEqual(["A", "B"]);
    expect(report.topReductions.map((item) => item.productCode)).toEqual(["B", "A"]);
    expect(report.countsByAlert.SEM_BASE).toBe(1);
    expect(report.countsByCurve.A).toBe(1);
    expect(report.internalInflationPercent).toBe(3.3333);
  });

  it("limita o ranking e preserva o item sem curva", () => {
    const report = buildCostBenchmarkReport({
      segment: "industry",
      benchmarks: {},
      topN: 1,
      items: [
        { productCode: "X", curve: "SEM_CURVA", costStart: 100, costEnd: 110 },
        { productCode: "Y", curve: "D", costStart: 100, costEnd: 90 },
      ],
    });
    expect(report.topIncreases).toHaveLength(1);
    expect(report.topReductions).toHaveLength(1);
    expect(report.items[0].reasons).toContain("item_sem_curva_abc");
  });
});
