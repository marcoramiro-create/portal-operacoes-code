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
});
