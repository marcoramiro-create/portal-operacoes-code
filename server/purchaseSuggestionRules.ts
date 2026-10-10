export type PurchaseCurve = "A" | "B" | "C" | "D" | "E" | "SEM_CURVA";
export type PurchaseDecision =
  | "COMPRAR_AGORA"
  | "COMPRAR_PROXIMA_JANELA"
  | "ACOMPANHAR"
  | "NAO_COMPRAR"
  | "REVISAR_CADASTRO"
  | "REVISAR_FORNECEDOR"
  | "REVISAR_DEMANDA"
  | "BLOQUEADO";
export type Confidence = "ALTA" | "MEDIA" | "BAIXA" | "BLOQUEADA";

export type PurchaseSuggestionInput = {
  productCode: string;
  description?: string;
  branchCode: string;
  warehouseCode?: string;
  active: boolean;
  mrp: boolean;
  curve: PurchaseCurve;
  availableStock: number;
  reservedStock: number;
  openPurchaseQty: number;
  inTransitQty: number;
  demandLast3Months: number[];
  demandLast6Months: number[];
  demandLast12Months: number[];
  leadTimeDays: number;
  safetyStockDays: number;
  targetCoverageDays: number;
  minimumLot?: number;
  purchaseMultiple?: number;
  supplier?: {
    code: string;
    store: string;
    active: boolean;
    ambiguousLink?: boolean;
    onTimeRate?: number;
    unitCost?: number;
  };
  hasProductMaster: boolean;
  hasBranchParameters: boolean;
  costVariationPercent?: number;
  openReceivingDiscrepancy?: boolean;
};

export type PurchaseSuggestion = {
  productCode: string;
  branchCode: string;
  decision: PurchaseDecision;
  confidence: Confidence;
  demandPerDay: number;
  projectedStock: number;
  coverageDays: number | null;
  targetStock: number;
  suggestedQty: number;
  estimatedValue: number | null;
  reasons: string[];
  blockers: string[];
  evidence: {
    demandWindow: "3M_6M_12M";
    curve: PurchaseCurve;
    mrp: boolean;
    supplierCode?: string;
    supplierStore?: string;
  };
};

const positive = (value: number) => Number.isFinite(value) && value > 0 ? value : 0;
const average = (values: number[]) => values.length === 0 ? 0 : values.reduce((sum, value) => sum + positive(value), 0) / values.length;

function roundToLot(quantity: number, minimumLot = 0, multiple = 1): number {
  if (quantity <= 0) return 0;
  const base = Math.max(quantity, positive(minimumLot));
  const step = Math.max(1, positive(multiple));
  return Math.ceil(base / step) * step;
}

function demandPerDay(input: PurchaseSuggestionInput): { value: number; window: "3M_6M_12M" } {
  const monthly3 = average(input.demandLast3Months);
  const monthly6 = average(input.demandLast6Months);
  const monthly12 = average(input.demandLast12Months);
  const weightedMonthly = monthly3 * 0.2 + monthly6 * 0.3 + monthly12 * 0.5;
  return { value: weightedMonthly / 30, window: "3M_6M_12M" };
}

export function buildPurchaseSuggestion(input: PurchaseSuggestionInput): PurchaseSuggestion {
  const reasons: string[] = [];
  const blockers: string[] = [];
  const demand = demandPerDay(input);
  const demandDaily = positive(demand.value);
  const available = positive(input.availableStock);
  const reserved = positive(input.reservedStock);
  const openPurchases = positive(input.openPurchaseQty);
  const inTransit = positive(input.inTransitQty);
  const projectedStock = available - reserved + openPurchases + inTransit - demandDaily * positive(input.leadTimeDays);
  const targetStock = demandDaily * (positive(input.targetCoverageDays) + positive(input.leadTimeDays) + positive(input.safetyStockDays));
  const coverageDays = demandDaily > 0 ? Math.max(0, available - reserved + openPurchases + inTransit) / demandDaily : null;

  if (!input.active) blockers.push("produto_inativo");
  if (!input.hasProductMaster) blockers.push("produto_sem_cadastro_SB1");
  if (!input.hasBranchParameters) blockers.push("parametros_SBZ_ausentes");
  if (input.openReceivingDiscrepancy) blockers.push("recebimento_com_divergencia");
  if (input.supplier?.ambiguousLink) blockers.push("SA5_ambigua");
  if (input.supplier && !input.supplier.active) blockers.push("fornecedor_inativo");
  if (input.costVariationPercent !== undefined && Math.abs(input.costVariationPercent) > 30) blockers.push("variacao_de_custo_acima_do_limite");
  if (input.leadTimeDays <= 0) blockers.push("lead_time_invalido");
  if (input.targetCoverageDays < 0 || input.safetyStockDays < 0) blockers.push("parametro_de_estoque_invalido");

  if (blockers.includes("SA5_ambigua") || blockers.includes("fornecedor_inativo")) {
    reasons.push("A amarração fornecedor-produto precisa ser resolvida antes da compra.");
  }
  if (openPurchases > 0) reasons.push(`${openPurchases} unidade(s) já constam em pedidos abertos.`);
  if (inTransit > 0) reasons.push(`${inTransit} unidade(s) estão consideradas em trânsito.`);
  if (demandDaily === 0) reasons.push("Não há demanda histórica suficiente para calcular consumo diário.");
  if (coverageDays !== null) reasons.push(`Cobertura projetada aproximada: ${coverageDays.toFixed(1)} dia(s).`);
  if (input.curve === "SEM_CURVA") reasons.push("Produto sem curva ABC/ABCDE; confiança limitada.");
  if (!input.mrp) reasons.push("Produto marcado como MRP Não; recomendação depende de revisão operacional.");
  if (input.costVariationPercent !== undefined && Math.abs(input.costVariationPercent) > 15) reasons.push("Custo recente apresenta variação relevante.");

  let decision: PurchaseDecision;
  if (blockers.length > 0) decision = "BLOQUEADO";
  else if (!input.supplier) decision = "REVISAR_FORNECEDOR";
  else if (demandDaily === 0) decision = "REVISAR_DEMANDA";
  else if (projectedStock < 0 || projectedStock < targetStock * 0.5) decision = "COMPRAR_AGORA";
  else if (projectedStock < targetStock) decision = "COMPRAR_PROXIMA_JANELA";
  else if (coverageDays !== null && coverageDays > input.targetCoverageDays * 2) decision = "NAO_COMPRAR";
  else decision = "ACOMPANHAR";

  const rawQty = Math.max(0, targetStock - projectedStock);
  const suggestedQty = decision === "COMPRAR_AGORA" || decision === "COMPRAR_PROXIMA_JANELA"
    ? roundToLot(rawQty, input.minimumLot, input.purchaseMultiple)
    : 0;
  const estimatedValue = input.supplier?.unitCost !== undefined ? suggestedQty * input.supplier.unitCost : null;

  const qualitySignals = [
    input.hasProductMaster,
    input.hasBranchParameters,
    Boolean(input.supplier && !input.supplier.ambiguousLink && input.supplier.active),
    input.curve !== "SEM_CURVA",
    demandDaily > 0,
    input.leadTimeDays > 0,
    input.costVariationPercent === undefined || Math.abs(input.costVariationPercent) <= 30,
  ].filter(Boolean).length;
  const confidence: Confidence = blockers.length > 0 ? "BLOQUEADA" : qualitySignals >= 6 ? "ALTA" : qualitySignals >= 4 ? "MEDIA" : "BAIXA";

  return {
    productCode: input.productCode,
    branchCode: input.branchCode,
    decision,
    confidence,
    demandPerDay: Number(demandDaily.toFixed(4)),
    projectedStock: Number(projectedStock.toFixed(4)),
    coverageDays: coverageDays === null ? null : Number(coverageDays.toFixed(2)),
    targetStock: Number(targetStock.toFixed(4)),
    suggestedQty,
    estimatedValue: estimatedValue === null ? null : Number(estimatedValue.toFixed(2)),
    reasons,
    blockers,
    evidence: {
      demandWindow: demand.window,
      curve: input.curve,
      mrp: input.mrp,
      supplierCode: input.supplier?.code,
      supplierStore: input.supplier?.store,
    },
  };
}
