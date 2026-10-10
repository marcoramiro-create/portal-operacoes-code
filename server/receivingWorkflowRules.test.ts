import { describe, expect, it } from "vitest";
import { canScanAccessKey, validateReceiptWorkflow } from "./receivingWorkflowRules";

const stages = [
  { stage: "RECEBIMENTO" as const, status: "CONCLUIDO" as const, completedBy: "u1" },
  { stage: "DESCARGA" as const, status: "CONCLUIDO" as const, completedBy: "u1" },
  { stage: "CONFERENCIA" as const, status: "EM_ANDAMENTO" as const },
  { stage: "FISCAL" as const, status: "PENDENTE" as const },
];
const items = [
  { lineNumber: 1, productCode: "P1", expectedQty: 10 },
  { lineNumber: 2, productCode: "P2", expectedQty: 5 },
];

describe("receiving workflow", () => {
  it("permite avançar após conferência completa e sem divergências", () => {
    const result = validateReceiptWorkflow({
      accessKey: "3".repeat(44), receiptType: "ESTOQUE_PROPRIO", stages, items,
      counts: [{ lineNumber: 1, countedQty: 10 }, { lineNumber: 2, countedQty: 5 }],
    });
    expect(result.valid).toBe(true);
    expect(result.nextStage).toBe("FISCAL");
    expect(result.pendingLineNumbers).toEqual([]);
    expect(result.discrepancies).toEqual([]);
  });

  it("bloqueia passagem para o fiscal quando falta item ou há divergência", () => {
    const result = validateReceiptWorkflow({
      accessKey: "4".repeat(44), receiptType: "ESTOQUE_PROPRIO", stages, items,
      counts: [{ lineNumber: 1, countedQty: 8, discrepancy: "FALTA" }],
    });
    expect(result.valid).toBe(false);
    expect(result.pendingLineNumbers).toEqual([2]);
    expect(result.discrepancies[0].type).toBe("FALTA");
    expect(result.blockers).toEqual(expect.arrayContaining(["divergencias_nao_tratadas_antes_do_fiscal", "conferencia_incompleta_antes_do_fiscal"]));
  });

  it("exige filial destino e impede redespacho para a própria origem", () => {
    const missing = validateReceiptWorkflow({ accessKey: "5".repeat(44), receiptType: "REDESPACHO", originBranchCode: "0101", stages, items: [], counts: [] });
    expect(missing.blockers).toContain("filial_destino_obrigatoria");
    const same = validateReceiptWorkflow({ accessKey: "5".repeat(44), receiptType: "REDESPACHO", originBranchCode: "0101", destinationBranchCode: "0101", stages, items: [], counts: [] });
    expect(same.blockers).toContain("filial_destino_igual_origem");
  });

  it("permite a mesma chave em pontos diferentes, mas não duplica no mesmo ponto", () => {
    expect(canScanAccessKey(["K1|recebimento"], "K1", "descarga")).toBe(true);
    expect(canScanAccessKey(["K1|recebimento"], "K1", "recebimento")).toBe(false);
  });
});
