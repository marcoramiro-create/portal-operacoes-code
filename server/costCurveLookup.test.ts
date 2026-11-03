import { describe, expect, it } from "vitest";
import {
  buildCostCurveLookup,
  findCostCurve,
  findMissingCurveCodes,
  mergeCostCurveLookups,
} from "./costCurveLookup";

describe("cost curve lookup", () => {
  it("indexes the same product independently by branch", () => {
    const lookup = buildCostCurveLookup([
      { code: "RA-001", branchCode: "0101", curve: "A" },
      { code: "RA-001", branchCode: "0105", curve: "C" },
    ]);

    expect(findCostCurve(lookup, "0101", "RA-001")).toBe("A");
    expect(findCostCurve(lookup, "0105", "RA-001")).toBe("C");
  });

  it("ignores incomplete or invalid rows", () => {
    const lookup = buildCostCurveLookup([
      { code: "", branchCode: "0101", curve: "A" },
      { code: "RA-002", branchCode: "", curve: "B" },
      { code: "RA-003", branchCode: "0101", curve: "X" },
    ]);

    expect(Object.keys(lookup)).toHaveLength(0);
  });

  it("matches the industry aggregate even when zero padding differs", () => {
    const lookup = buildCostCurveLookup([
      { code: "03545", branchCode: "0105", curve: "A" },
    ]);

    expect(findCostCurve(lookup, "0105", "3545")).toBe("A");
    expect(findCostCurve(lookup, "0105", "03545-MGT")).toBeUndefined();
  });

  it("keeps the most recent valid historical curve for the same branch and code", () => {
    const lookup = buildCostCurveLookup([
      { code: "899", branchCode: "0101", curve: "C" },
      { code: "00899", branchCode: "0101", curve: "D" },
    ]);

    expect(findCostCurve(lookup, "0101", "00899")).toBe("D");
    expect(findCostCurve(lookup, "0101", "899")).toBe("D");
  });

  it("requests historical codes only when neither aggregate nor product has a current curve", () => {
    const current = buildCostCurveLookup([
      { code: "00899", branchCode: "0101", curve: "C" },
      { code: "00123-MGT", branchCode: "0102", curve: "B" },
    ]);
    const missing = findMissingCurveCodes([
      { branchCode: "0101", aggregateCode: "00899", productCode: "00899" },
      { branchCode: "0102", aggregateCode: "00999", productCode: "00123-MGT" },
      { branchCode: "0103", aggregateCode: "00724-MGT", productCode: "00724-MGT1" },
    ], current);

    expect(missing).toEqual([
      { branchCode: "0103", code: "00724-MGT" },
      { branchCode: "0103", code: "00724-MGT1" },
    ]);
  });

  it("merges historical curves without overwriting current aggregate or product curves", () => {
    const current = buildCostCurveLookup([
      { code: "00899", branchCode: "0101", curve: "C" },
      { code: "00123-MGT", branchCode: "0102", curve: "B" },
    ]);
    const historical = buildCostCurveLookup([
      { code: "00899", branchCode: "0101", curve: "D" },
      { code: "00999", branchCode: "0102", curve: "A" },
      { code: "00724-MGT", branchCode: "0103", curve: "D" },
    ]);
    const combined = mergeCostCurveLookups(current, historical);

    expect(findCostCurve(combined, "0101", "00899")).toBe("C");
    expect(findCostCurve(combined, "0102", "00123-MGT")).toBe("B");
    expect(findCostCurve(combined, "0102", "00999")).toBe("A");
    expect(findCostCurve(combined, "0103", "00724-MGT")).toBe("D");
    expect(findCostCurve(combined, "0104", "00724-MGT")).toBeUndefined();
  });
});
