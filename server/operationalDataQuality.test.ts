import { describe, expect, it } from "vitest";
import { buildOperationalDataQualityReport } from "./operationalDataQuality";

describe("operational data quality", () => {
  it("aprova fontes consistentes", () => {
    const report = buildOperationalDataQualityReport({
      products: [{ code: "P1", active: true }],
      branchProducts: [{ productCode: "P1", branchCode: "0101" }],
      suppliers: [{ code: "F1", store: "01", active: true }],
      supplierLinks: [{ supplierCode: "F1", store: "01", externalProductCode: "EXT1", internalProductCode: "P1" }],
      orders: [{ orderNumber: "SC7-1", productCode: "P1", branchCode: "0101", quantity: 10, openQuantity: 10 }],
    });
    expect(report.status).toBe("OK");
    expect(report.counts.error).toBe(0);
  });

  it("bloqueia inconsistências de SBZ, SA5 e SC7", () => {
    const report = buildOperationalDataQualityReport({
      products: [{ code: "P1", active: false }],
      branchProducts: [{ productCode: "P2", branchCode: "0101" }],
      suppliers: [],
      supplierLinks: [{ supplierCode: "F1", store: "01", externalProductCode: "EXT1" }],
      orders: [{ orderNumber: "SC7-1", productCode: "P2", branchCode: "0101", quantity: -1 }],
    });
    expect(report.status).toBe("BLOQUEADO");
    expect(report.counts.error).toBeGreaterThanOrEqual(4);
    expect(report.issues.map(item => item.code)).toEqual(expect.arrayContaining([
      "SBZ_WITHOUT_SB1", "SA5_WITHOUT_SA2", "SA5_WITHOUT_INTERNAL_PRODUCT", "ORDER_PRODUCT_NOT_FOUND",
    ]));
  });

  it("detecta duplicidade de chave natural e fonte vazia", () => {
    const report = buildOperationalDataQualityReport({
      products: [{ code: "P1" }, { code: "P1" }],
      expectedSources: ["SB1", "SA5"],
      loadedSources: { SB1: 2, SA5: 0 },
    });
    expect(report.status).toBe("BLOQUEADO");
    expect(report.issues.some(item => item.code === "DUPLICATE_PRODUCT")).toBe(true);
    expect(report.issues.some(item => item.code === "SOURCE_EMPTY")).toBe(true);
  });
});
