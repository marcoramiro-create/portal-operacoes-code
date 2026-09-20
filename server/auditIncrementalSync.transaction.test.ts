import { describe, expect, it } from "vitest";
import { syncIncrementally } from "./auditIncrementalSync";

const actor = { id: "00000000-0000-0000-0000-000000000001" } as any;
function reader() {
  return {
    async listLatestProcessedBatchIds() { return new Map([["SB1", "b1"], ["SBZ", "b2"], ["SB5", "b3"], ["SA2", "b4"], ["PEDIDO_COMPRA", "b5"], ["NF_LEGAL", "b6"], ["FECHAMENTO_ESTOQUE", "b7"]] as any); },
    async *readSourceBatchPages(batchId: string) { if (batchId === "b1") yield { batchId, rows: [{ sourceRowNumber: 1, payload: { productCode: "001" } }], nextCursor: 1 }; },
  } as any;
}
describe("syncIncrementally transaction", () => {
  it("abre transação, adquire lock, grava run e faz commit", async () => {
    const calls: string[] = [];
    const client = { async query(sql: string) { calls.push(sql); if (sql.includes("returning id")) return { rows: [{ id: "run-1" }] }; return { rows: [], rowCount: 1 }; }, release() { calls.push("release"); } };
    const result = await syncIncrementally(actor, { reader: reader(), db: { connect: async () => client } });
    expect(result.runId).toBe("run-1");
    expect(calls.indexOf("begin")).toBeLessThan(calls.findIndex(x => x.includes("advisory_xact_lock")));
    expect(calls.at(-3)).toContain("update public.audit_runs");
    expect(calls.at(-2)).toBe("commit");
    expect(calls.at(-1)).toBe("release");
    expect(calls).toContain("commit");
  });
});
