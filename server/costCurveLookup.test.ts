import { describe, expect, it } from "vitest";
import { buildCostCurveLookup, findCostCurve } from "./costCurveLookup";

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
});
