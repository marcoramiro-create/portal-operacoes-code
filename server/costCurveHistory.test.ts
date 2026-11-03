import { describe, expect, it, vi } from "vitest";
import { buildCostCurveLookup, findCostCurve } from "./costCurveLookup";
import {
  addLatestHistoricalCostCurves,
  addLatestHistoricalIndustryCurves,
} from "./costCurveHistory";

describe("fallback histórico de curvas de Autopeças", () => {
  it("consulta somente pares sem vínculo atual e não sobrescreve a curva primária", async () => {
    const query = vi.fn(async (sql: unknown) => String(sql).includes('select id::text as id')
      ? { rows: [{ id: "64" }] }
        : { rows: [{ branchCode: "0103", code: "00724-MGT", curve: "D" }] });
    const current = buildCostCurveLookup([
      { branchCode: "0101", code: "00899", curve: "C" },
      { branchCode: "0102", code: "00289-MGT2", curve: "B" },
    ]);
    const pool = { query } as unknown as Parameters<typeof addLatestHistoricalCostCurves>[0];
    const items = [
      { branchCode: "0101", aggregateCode: "00899", productCode: "00899" },
      { branchCode: "0102", aggregateCode: "00289", productCode: "00289-MGT2" },
      { branchCode: "0103", aggregateCode: "00724-MGT", productCode: "00724-MGT1" },
    ];
    const combined = await addLatestHistoricalCostCurves(
      pool,
      current,
      items,
    );

    expect(findCostCurve(combined, "0101", "00899")).toBe("C");
    expect(findCostCurve(combined, "0102", "00289-MGT2")).toBe("B");
    expect(findCostCurve(combined, "0102", "00289-MGT2")).toBe("B");
    expect(findCostCurve(combined, "0103", "00724-MGT")).toBe("D");
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("i.status = 'approved'");
    expect(query.mock.calls[1]?.[0]).toContain('"importedAt" desc');
    expect(query.mock.calls[1]?.[1]).toEqual([["0103", "0103"], ["00724-MGT", "00724-MGT1"]]);

    const repeated = await addLatestHistoricalCostCurves(pool, current, items);
    expect(findCostCurve(repeated, "0103", "00724-MGT")).toBe("D");
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("não faz consulta histórica quando agregado ou produto já tem curva atual", async () => {
    const query = vi.fn();
    const current = buildCostCurveLookup([
      { branchCode: "0101", code: "00899", curve: "C" },
      { branchCode: "0102", code: "00289-MGT2", curve: "B" },
    ]);
    const result = await addLatestHistoricalCostCurves(
      { query } as unknown as Parameters<typeof addLatestHistoricalCostCurves>[0],
      current,
      [
        { branchCode: "0101", aggregateCode: "00899", productCode: "00899" },
        { branchCode: "0102", aggregateCode: "00289", productCode: "00289-MGT2" },
      ],
    );

    expect(result).toBe(current);
    expect(query).not.toHaveBeenCalled();
  });

  it("mantém sem curva um código sem qualquer registro histórico", async () => {
    const query = vi.fn(async (sql: unknown) => String(sql).includes('select id::text as id')
      ? { rows: [{ id: "64" }] }
      : { rows: [] });
    const result = await addLatestHistoricalCostCurves(
      { query } as unknown as Parameters<typeof addLatestHistoricalCostCurves>[0],
      {},
      [{ branchCode: "0108", aggregateCode: "02689-MGT1", productCode: "02689-MGT1" }],
    );

    expect(findCostCurve(result, "0108", "02689-MGT1")).toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("recupera a última curva ABC histórica da Indústria somente para os vínculos ausentes", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ branchCode: "0105", code: "00074", curve: "B" }],
    });
    const current = buildCostCurveLookup([
      { branchCode: "0105", code: "00001", curve: "A" },
    ]);
    const result = await addLatestHistoricalIndustryCurves(
      { query } as unknown as Parameters<typeof addLatestHistoricalIndustryCurves>[0],
      current,
      [
        { branchCode: "0105", aggregateCode: "00001", productCode: "00001" },
        { branchCode: "0105", aggregateCode: "00074", productCode: "00074-MGT" },
      ],
    );

    expect(findCostCurve(result, "0105", "00001")).toBe("A");
    expect(findCostCurve(result, "0105", "00074")).toBe("B");
    expect(findCostCurve(result, "0104", "00074")).toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("c.operation = 'INDUSTRIA'");
    expect(query.mock.calls[0]?.[0]).toContain("c.is_current = true");
    expect(query.mock.calls[0]?.[0]).toContain('"referencePeriod" desc');
    expect(query.mock.calls[0]?.[0]).toContain("c.curve_code in ('A', 'B', 'C')");
    expect(query.mock.calls[0]?.[1]).toEqual([["0105", "0105"], ["00074", "00074-MGT"]]);
  });
});
