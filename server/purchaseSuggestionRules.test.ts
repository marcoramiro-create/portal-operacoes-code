import { describe, expect, it } from "vitest";
import { buildPurchaseSuggestion, type PurchaseSuggestionInput } from "./purchaseSuggestionRules";

const base = (overrides: Partial<PurchaseSuggestionInput> = {}): PurchaseSuggestionInput => ({
  productCode: "P-001",
  branchCode: "0101",
  active: true,
  mrp: true,
  curve: "A",
  availableStock: 10,
  reservedStock: 0,
  openPurchaseQty: 0,
  inTransitQty: 0,
  demandLast3Months: [90, 90, 90],
  demandLast6Months: [90, 90, 90, 90, 90, 90],
  demandLast12Months: Array(12).fill(90),
  leadTimeDays: 10,
  safetyStockDays: 10,
  targetCoverageDays: 30,
  minimumLot: 5,
  purchaseMultiple: 5,
  supplier: { code: "F001", store: "01", active: true, unitCost: 12 },
  hasProductMaster: true,
  hasBranchParameters: true,
  ...overrides,
});

describe("purchase suggestion rules", () => {
  it("recomenda compra imediata quando o saldo projetado fica negativo", () => {
    const result = buildPurchaseSuggestion(base());
    expect(result.decision).toBe("COMPRAR_AGORA");
    expect(result.suggestedQty).toBeGreaterThan(0);
    expect(result.confidence).toBe("ALTA");
    expect(result.estimatedValue).toBeGreaterThan(0);
  });

  it("considera pedidos abertos e trânsito no saldo projetado", () => {
    const result = buildPurchaseSuggestion(base({
      availableStock: 100,
      openPurchaseQty: 100,
      inTransitQty: 100,
    }));
    expect(result.decision).toBe("NAO_COMPRAR");
    expect(result.suggestedQty).toBe(0);
    expect(result.reasons.some(reason => reason.includes("pedidos abertos"))).toBe(true);
  });

  it("bloqueia produto sem parâmetros de filial", () => {
    const result = buildPurchaseSuggestion(base({ hasBranchParameters: false }));
    expect(result.decision).toBe("BLOQUEADO");
    expect(result.confidence).toBe("BLOQUEADA");
    expect(result.blockers).toContain("parametros_SBZ_ausentes");
    expect(result.suggestedQty).toBe(0);
  });

  it("não escolhe fornecedor quando a SA5 é ambígua", () => {
    const result = buildPurchaseSuggestion(base({
      supplier: { code: "F001", store: "01", active: true, ambiguousLink: true },
    }));
    expect(result.decision).toBe("BLOQUEADO");
    expect(result.blockers).toContain("SA5_ambigua");
  });

  it("manda demanda sem histórico para revisão, sem sugerir quantidade", () => {
    const result = buildPurchaseSuggestion(base({
      demandLast3Months: [],
      demandLast6Months: [],
      demandLast12Months: [],
    }));
    expect(result.decision).toBe("REVISAR_DEMANDA");
    expect(result.suggestedQty).toBe(0);
    expect(result.coverageDays).toBeNull();
  });

  it("arredonda a sugestão ao múltiplo de compra", () => {
    const result = buildPurchaseSuggestion(base({
      availableStock: 55,
      demandLast3Months: [150, 150, 150],
      demandLast6Months: Array(6).fill(150),
      demandLast12Months: Array(12).fill(150),
      targetCoverageDays: 30,
      safetyStockDays: 0,
      leadTimeDays: 10,
      purchaseMultiple: 10,
    }));
    expect(result.suggestedQty % 10).toBe(0);
  });
});
