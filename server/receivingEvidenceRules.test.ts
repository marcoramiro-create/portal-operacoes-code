import { describe, expect, it } from "vitest";
import { queueEvidenceForWhatsapp, validateEvidenceForStage } from "./receivingEvidenceRules";

const evidence = [{ id: "1", receiptId: "r1", stage: "CONFERENCIA" as const, kind: "DIVERGENCIA" as const, storageKey: "receipts/r1/1.jpg", mimeType: "image/jpeg" as const, capturedAt: "2026-10-10T12:00:00Z", capturedBy: "u1", visibility: "INTERNA" as const, lineNumber: 2, discrepancyType: "FALTA" as const }];

describe("receiving evidence rules", () => {
  it("exige foto quando a etapa foi configurada como obrigatória", () => {
    const result = validateEvidenceForStage({ stage: "DESCARGA", evidence, requirePhoto: true });
    expect(result.valid).toBe(false);
    expect(result.blockers).toContain("foto_obrigatoria_ausente");
  });

  it("exige evidência para cada item divergente", () => {
    const result = validateEvidenceForStage({ stage: "CONFERENCIA", evidence, requirePhoto: false, discrepancyLineNumbers: [2, 3] });
    expect(result.valid).toBe(false);
    expect(result.blockers).toContain("foto_da_divergencia_ausente_3");
  });

  it("mantém evidência interna quando publicação não foi autorizada", () => {
    expect(queueEvidenceForWhatsapp(evidence, false)[0].visibility).toBe("INTERNA");
    expect(queueEvidenceForWhatsapp(evidence, true)[0].visibility).toBe("WHATSAPP_PENDENTE");
  });
});
