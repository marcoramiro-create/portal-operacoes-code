export type ReceiptType = "ESTOQUE_PROPRIO" | "REDESPACHO";
export type ReceiptStage = "RECEBIMENTO" | "DESCARGA" | "CONFERENCIA" | "FISCAL" | "ESTOQUE" | "REDESPACHO" | "ENCERRADO";
export type StageStatus = "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO" | "BLOQUEADO";
export type DiscrepancyType = "FALTA" | "EXCESSO" | "AVARIA" | "PRODUTO_DIVERGENTE" | "SEM_AMARRACAO";

export type ReceiptStageState = { stage: ReceiptStage; status: StageStatus; startedAt?: string; completedAt?: string; completedBy?: string };
export type ReceiptItem = { lineNumber: number; productCode: string; expectedQty: number; unit?: string };
export type ItemCount = { lineNumber: number; countedQty: number; scannedCode?: string; discrepancy?: DiscrepancyType };
export type ReceiptWorkflowInput = {
  accessKey: string;
  receiptType: ReceiptType;
  destinationBranchCode?: string;
  originBranchCode?: string;
  stages: ReceiptStageState[];
  items: ReceiptItem[];
  counts: ItemCount[];
};

export type ReceiptWorkflowResult = {
  valid: boolean;
  nextStage: ReceiptStage | null;
  stages: ReceiptStageState[];
  pendingLineNumbers: number[];
  discrepancies: Array<{ lineNumber: number; type: DiscrepancyType; expectedQty: number; countedQty: number }>;
  blockers: string[];
  reasons: string[];
};

const stageOrder: ReceiptStage[] = ["RECEBIMENTO", "DESCARGA", "CONFERENCIA", "FISCAL", "ESTOQUE", "REDESPACHO", "ENCERRADO"];
const activeStages = (type: ReceiptType) => type === "REDESPACHO" ? ["RECEBIMENTO", "DESCARGA", "CONFERENCIA", "FISCAL", "REDESPACHO", "ENCERRADO"] as ReceiptStage[] : ["RECEBIMENTO", "DESCARGA", "CONFERENCIA", "FISCAL", "ESTOQUE", "ENCERRADO"] as ReceiptStage[];

export function getNextStage(receiptType: ReceiptType, current: ReceiptStage): ReceiptStage | null {
  const stages = activeStages(receiptType);
  const index = stages.indexOf(current);
  return index >= 0 && index < stages.length - 1 ? stages[index + 1] : null;
}

export function validateReceiptWorkflow(input: ReceiptWorkflowInput): ReceiptWorkflowResult {
  const blockers: string[] = [];
  const reasons: string[] = [];
  if (!input.accessKey || input.accessKey.length < 20) blockers.push("chave_de_acesso_invalida");
  if (input.receiptType === "REDESPACHO" && !input.destinationBranchCode) blockers.push("filial_destino_obrigatoria");
  if (input.receiptType === "REDESPACHO" && input.destinationBranchCode === input.originBranchCode) blockers.push("filial_destino_igual_origem");

  const active = activeStages(input.receiptType);
  const stages = input.stages.filter(state => active.includes(state.stage));
  const current = [...stages].reverse().find(state => state.status === "EM_ANDAMENTO" || state.status === "PENDENTE")?.stage ?? "RECEBIMENTO";
  const currentIndex = active.indexOf(current);
  for (const state of stages) {
    const index = active.indexOf(state.stage);
    if (index > currentIndex && state.status === "CONCLUIDO") blockers.push(`estagio_fora_de_ordem_${state.stage}`);
    if (state.stage === "RECEBIMENTO" && state.status === "CONCLUIDO" && !state.completedBy) blockers.push("recebimento_sem_responsavel");
  }

  const itemByLine = new Map(input.items.map(item => [item.lineNumber, item]));
  const countByLine = new Map<number, ItemCount>();
  for (const count of input.counts) {
    if (!itemByLine.has(count.lineNumber)) blockers.push(`contagem_sem_item_${count.lineNumber}`);
    if (countByLine.has(count.lineNumber)) blockers.push(`item_lido_mais_de_uma_vez_${count.lineNumber}`);
    countByLine.set(count.lineNumber, count);
  }

  const discrepancies: ReceiptWorkflowResult["discrepancies"] = [];
  const pendingLineNumbers: number[] = [];
  for (const item of input.items) {
    const count = countByLine.get(item.lineNumber);
    if (!count) {
      pendingLineNumbers.push(item.lineNumber);
      continue;
    }
    if (count.countedQty < 0) blockers.push(`quantidade_negativa_${item.lineNumber}`);
    if (count.countedQty !== item.expectedQty) {
      const type: DiscrepancyType = count.discrepancy ?? (count.countedQty < item.expectedQty ? "FALTA" : "EXCESSO");
      discrepancies.push({ lineNumber: item.lineNumber, type, expectedQty: item.expectedQty, countedQty: count.countedQty });
    }
  }
  if (discrepancies.length > 0) reasons.push(`${discrepancies.length} item(ns) possuem divergência e exigem tratamento.`);
  if (pendingLineNumbers.length > 0) reasons.push(`${pendingLineNumbers.length} item(ns) ainda não foram conferidos.`);
  if (input.receiptType === "REDESPACHO") reasons.push(`Após o redespacho, a filial destino ${input.destinationBranchCode ?? "não informada"} deve consultar a mesma NF.`);

  const lastCompleted = [...stages].reverse().find(state => state.status === "CONCLUIDO")?.stage ?? "RECEBIMENTO";
  const conferenceInProgress = stages.some(state => state.stage === "CONFERENCIA" && state.status === "EM_ANDAMENTO");
  const conferenceComplete = conferenceInProgress && pendingLineNumbers.length === 0 && discrepancies.length === 0;
  const nextStage = conferenceComplete
    ? getNextStage(input.receiptType, "CONFERENCIA")
    : getNextStage(input.receiptType, lastCompleted);
  if (conferenceInProgress && discrepancies.length > 0) blockers.push("divergencias_nao_tratadas_antes_do_fiscal");
  if (conferenceInProgress && pendingLineNumbers.length > 0) blockers.push("conferencia_incompleta_antes_do_fiscal");

  const valid = blockers.length === 0;
  return { valid, nextStage, stages, pendingLineNumbers, discrepancies, blockers, reasons };
}

export function canScanAccessKey(existingAccessKeys: string[], accessKey: string, readingPoint: string): boolean {
  return !existingAccessKeys.includes(`${accessKey}|${readingPoint}`);
}

export { stageOrder };
