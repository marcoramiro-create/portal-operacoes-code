import type { ReceiptStage, DiscrepancyType } from "./receivingWorkflowRules";

export type EvidenceKind = "RECEBIMENTO" | "DESCARGA" | "CONFERENCIA" | "DIVERGENCIA" | "REDESPACHO";
export type EvidenceVisibility = "INTERNA" | "WHATSAPP_PENDENTE" | "WHATSAPP_PUBLICADA";
export type EvidenceMetadata = {
  id: string;
  receiptId: string;
  stage: ReceiptStage;
  kind: EvidenceKind;
  storageKey: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  capturedAt: string;
  capturedBy: string;
  visibility: EvidenceVisibility;
  lineNumber?: number;
  discrepancyType?: DiscrepancyType;
};

export type EvidenceValidation = { valid: boolean; blockers: string[]; reasons: string[] };

export function validateEvidenceForStage(input: {
  stage: ReceiptStage;
  evidence: EvidenceMetadata[];
  requirePhoto: boolean;
  discrepancyLineNumbers?: number[];
}): EvidenceValidation {
  const blockers: string[] = [];
  const reasons: string[] = [];
  const stageEvidence = input.evidence.filter(item => item.stage === input.stage);
  if (input.requirePhoto && stageEvidence.length === 0) {
    blockers.push("foto_obrigatoria_ausente");
    reasons.push(`A etapa ${input.stage} exige ao menos uma evidência fotográfica.`);
  }
  for (const lineNumber of input.discrepancyLineNumbers ?? []) {
    const hasLineEvidence = input.evidence.some(item => item.stage === "CONFERENCIA" && item.lineNumber === lineNumber);
    if (!hasLineEvidence) blockers.push(`foto_da_divergencia_ausente_${lineNumber}`);
  }
  if (stageEvidence.some(item => !item.storageKey || !item.capturedBy || !item.capturedAt)) blockers.push("metadado_de_evidencia_incompleto");
  return { valid: blockers.length === 0, blockers, reasons };
}

export function queueEvidenceForWhatsapp(evidence: EvidenceMetadata[], publish: boolean): EvidenceMetadata[] {
  if (!publish) return evidence.map(item => ({ ...item, visibility: "INTERNA" }));
  return evidence.map(item => item.visibility === "WHATSAPP_PUBLICADA" ? item : ({ ...item, visibility: "WHATSAPP_PENDENTE" }));
}
