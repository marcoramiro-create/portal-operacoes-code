import { describe, expect, it } from "vitest";
import { processFindingsIncrementally } from "./auditIncrementalSync";

describe("auditIncrementalSync", () => {
  it("grava cada página antes de ler a próxima", async () => {
    const events: string[] = [];
    const reader = { async *readSourceBatchPages() { events.push("read-1"); yield { batchId: "b", rows: [{ sourceRowNumber: 1, payload: {} }], nextCursor: 1 }; events.push("read-2"); yield { batchId: "b", rows: [{ sourceRowNumber: 2, payload: {} }], nextCursor: 2 }; } };
    const result = await processFindingsIncrementally(reader, new Map([["SB1", "b"]]), (_source, page) => page.rows.map(row => ({ category: "EXCECAO", kind: "TEST", scope: null, source: "SB1", sourceKey: String(row.sourceRowNumber), detail: "teste" })), async finding => { events.push(`write-${finding.sourceKey}`); });
    expect(events).toEqual(["read-1", "write-1", "read-2", "write-2"]);
    expect(result).toEqual({ rowsRead: 2, findingsWritten: 2 });
  });
});
