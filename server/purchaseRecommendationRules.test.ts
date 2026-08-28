import { describe, expect, it } from "vitest";
import { validatePurchaseRecommendations, type PurchaseRecommendation } from "./analyticsRules";

describe("regras de recomendação de compras", () => {
  it("aceita somente códigos reais, sem duplicidade e com justificativa", () => {
    const recommendations: PurchaseRecommendation[] = [
      { code: "A", action: "comprar", confidence: "alta", rationale: "Cobertura baixa." },
      { code: "A", action: "pausar/reduzir", confidence: "média", rationale: "Duplicado." },
      { code: "DESCONHECIDO", action: "acompanhar", confidence: "baixa", rationale: "Não está na seleção." },
      { code: "B", action: "acompanhar", confidence: "baixa", rationale: "   " },
      { code: "C", action: "pausar/reduzir", confidence: "média", rationale: "Excedente identificado." },
    ];

    expect(validatePurchaseRecommendations(recommendations, new Set(["A", "B", "C"]))).toEqual([
      recommendations[0],
      recommendations[4],
    ]);
  });
});
