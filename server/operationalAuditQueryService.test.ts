import { describe, expect, it } from "vitest";
import { buildOperationalAuditReport } from "./operationalAuditService";

describe("operationalAuditQueryService contract", () => {
  it("mantém o relatório somente leitura e sem produto cartesiano", () => {
    const sb1 = [{ productCode: "0001", normalizedProductCode: "0001", aggregateProductCode: "AG1", normalizedAggregateProductCode: "AG1" }] as any;
    const report = buildOperationalAuditReport({ sb1, sbz: [{ productCode: "0001", normalizedProductCode: "0001", branchCode: "0101" }] as any, sa2: [] as any });
    expect(report.readOnly).toBe(true);
    expect(report.metrics.find(metric => metric.source === "SBZ→SB1")?.total).toBe(1);
  });
});
