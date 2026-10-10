import { describe, expect, it } from "vitest";
import { buildPurchaseSimulation } from "./purchaseSuggestionSimulation";
import type { PurchaseSuggestionInput } from "./purchaseSuggestionRules";

const input = (productCode: string, overrides: Partial<PurchaseSuggestionInput> = {}): PurchaseSuggestionInput => ({
  productCode,
  branchCode: "0101",
  active: true,
  mrp: true,
  curve: "A",
  availableStock: 10,
  reservedStock: 0,
  openPurchaseQty: 0,
  inTransitQty: 0,
  demandLast3Months: [90, 90, 90],
  demandLast6Months: Array(6).fill(90),
  demandLast12Months: Array(12).fill(90),
  leadTimeDays: 10,
  safetyStockDays: 10,
  targetCoverageDays: 30,
  purchaseMultiple: 5,
  supplier: { code: "F1", store: "01", active: true, unitCost: 10 },
  hasProductMaster: true,
  hasBranchParameters: true,
  ...overrides,
});

describe("purchase simulation", () => {
  it("consolida totais e ordena bloqueios antes das compras", () => {
    const result = buildPurchaseSimulation([
      input("P-OK", { availableStock: 200 }),
      input("P-BLOCKED", { hasBranchParameters: false }),
      input("P-BUY", { availableStock: 10 }),
    ], "2026-10-10T22:00:00.000Z");

    expect(result.generatedAt).toBe("2026-10-10T22:00:00.000Z");
    expect(result.summary.totalItems).toBe(3);
    expect(result.summary.blockedItems).toBe(1);
    expect(result.summary.itemsToBuyNow).toBe(1);
    expect(result.summary.suggestedUnits).toBeGreaterThan(0);
    expect(result.rows[0].productCode).toBe("P-BLOCKED");
  });

  it("calcula valor estimado apenas das linhas com quantidade sugerida", () => {
    const result = buildPurchaseSimulation([
      input("P-1", { availableStock: 10, supplier: { code: "F1", store: "01", active: true, unitCost: 12 } }),
      input("P-2", { availableStock: 200, supplier: { code: "F1", store: "01", active: true, unitCost: 99 } }),
    ]);
    expect(result.summary.estimatedValue).toBeGreaterThan(0);
    expect(result.rows.find(row => row.productCode === "P-2")?.estimatedValue).toBe(0);
  });
});
