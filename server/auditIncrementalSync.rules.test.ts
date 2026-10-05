import { describe, expect, it } from "vitest";
import { findingsForPage, makeIndexes } from "./auditIncrementalSync";

const reader = {
  async *readSourceBatchPages(batchId: string) {
    const payload = batchId === "sb1" ? [{ productCode: "001", aggregateProductCode: "A1" }] : batchId === "sbz" ? [{ branchCode: "0101 - X", productCode: "001" }] : batchId === "sa2" ? [{ document: "12.345.678/0001-90" }] : [];
    if (payload.length) yield { batchId, rows: payload.map((p, i) => ({ sourceRowNumber: i + 1, payload: p })), nextCursor: payload.length };
  },
} as any;

describe("auditIncrementalSync rules", () => {
  it("uses the same basic crosswalk semantics for a valid order", async () => {
    const index = await makeIndexes(reader, new Map([["SB1", "sb1"], ["SBZ", "sbz"], ["SA2", "sa2"]]));
    const page = { batchId: "orders", rows: [{ sourceRowNumber: 1, payload: { branch: "0101 - X", productCode: "001", key: "0101|123|0001" } }], nextCursor: 1 };
    expect(findingsForPage("PEDIDO_COMPRA", page, index)).toEqual([]);
  });
  it("creates the expected missing-product exception", async () => {
    const index = await makeIndexes(reader, new Map([["SB1", "sb1"], ["SBZ", "sbz"], ["SA2", "sa2"]]));
    const page = { batchId: "orders", rows: [{ sourceRowNumber: 1, payload: { branch: "0101", productCode: "999", key: "0101|123|0001" } }], nextCursor: 1 };
    expect(findingsForPage("PEDIDO_COMPRA", page, index).map(x => x.kind)).toEqual(["PRODUTO_NAO_ENCONTRADO_SB1", "PRODUTO_SEM_SBZ_FILIAL"]);
  });
});
