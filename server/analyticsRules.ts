export function calculateTurnover(salesValue13M: number, stockValue: number) {
  if (stockValue <= 0) return 0;
  return salesValue13M / stockValue;
}

export type PurchaseRecommendation = { code: string; action: "comprar" | "pausar/reduzir" | "acompanhar"; confidence: "alta" | "média" | "baixa"; rationale: string };

export function validatePurchaseRecommendations(recommendations: PurchaseRecommendation[], validCodes: Set<string>) {
  const seen = new Set<string>();
  return recommendations.filter(recommendation => {
    if (!validCodes.has(recommendation.code) || seen.has(recommendation.code) || !recommendation.rationale.trim()) return false;
    seen.add(recommendation.code);
    return true;
  });
}
