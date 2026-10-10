import { buildPurchaseSuggestion, type PurchaseSuggestion, type PurchaseSuggestionInput, type PurchaseDecision } from "./purchaseSuggestionRules";

export type PurchaseSimulation = {
  generatedAt: string;
  rows: PurchaseSuggestion[];
  summary: {
    totalItems: number;
    itemsToBuyNow: number;
    itemsToBuyNextWindow: number;
    itemsToMonitor: number;
    itemsWithoutPurchase: number;
    itemsToReview: number;
    blockedItems: number;
    suggestedUnits: number;
    estimatedValue: number;
    highConfidenceItems: number;
    averageCoverageDays: number | null;
  };
};

const priority: Record<PurchaseDecision, number> = {
  BLOQUEADO: 0,
  COMPRAR_AGORA: 1,
  REVISAR_CADASTRO: 2,
  REVISAR_FORNECEDOR: 3,
  REVISAR_DEMANDA: 4,
  COMPRAR_PROXIMA_JANELA: 5,
  ACOMPANHAR: 6,
  NAO_COMPRAR: 7,
};

function countDecision(rows: PurchaseSuggestion[], decision: PurchaseDecision) {
  return rows.filter(row => row.decision === decision).length;
}

export function buildPurchaseSimulation(inputs: PurchaseSuggestionInput[], generatedAt = new Date().toISOString()): PurchaseSimulation {
  const rows = inputs
    .map(buildPurchaseSuggestion)
    .sort((left, right) => priority[left.decision] - priority[right.decision] || (right.suggestedQty - left.suggestedQty) || left.productCode.localeCompare(right.productCode));
  const coverages = rows.flatMap(row => row.coverageDays === null ? [] : [row.coverageDays]);
  const estimatedValue = rows.reduce((sum, row) => sum + (row.estimatedValue ?? 0), 0);
  return {
    generatedAt,
    rows,
    summary: {
      totalItems: rows.length,
      itemsToBuyNow: countDecision(rows, "COMPRAR_AGORA"),
      itemsToBuyNextWindow: countDecision(rows, "COMPRAR_PROXIMA_JANELA"),
      itemsToMonitor: countDecision(rows, "ACOMPANHAR"),
      itemsWithoutPurchase: countDecision(rows, "NAO_COMPRAR"),
      itemsToReview: rows.filter(row => ["REVISAR_CADASTRO", "REVISAR_FORNECEDOR", "REVISAR_DEMANDA"].includes(row.decision)).length,
      blockedItems: countDecision(rows, "BLOQUEADO"),
      suggestedUnits: rows.reduce((sum, row) => sum + row.suggestedQty, 0),
      estimatedValue: Number(estimatedValue.toFixed(2)),
      highConfidenceItems: rows.filter(row => row.confidence === "ALTA").length,
      averageCoverageDays: coverages.length === 0 ? null : Number((coverages.reduce((sum, value) => sum + value, 0) / coverages.length).toFixed(2)),
    },
  };
}
