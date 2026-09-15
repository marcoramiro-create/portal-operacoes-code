import { describe, expect, it, vi } from "vitest";
import { calculateFileHash, importCatalogRows } from "./operationalImportService";

describe("importCatalogRows", () => {
  it("gera hash estável", () => expect(calculateFileHash("abc")).toBe(calculateFileHash("abc")));
  it("grava lote e payload em transação", async () => {
    const queries: string[] = []; const client = { query: vi.fn(async (sql: string) => { queries.push(sql); return sql.startsWith("select id") ? { rows: [] } : { rows: [] }; }), release: vi.fn() };
    const pool = { connect: vi.fn(async () => client) } as any;
    const row = { productCode: "00000136-MGT", normalizedProductCode: "00000136-MGT", aggregateProductCode: "00000136", normalizedAggregateProductCode: "00000136", description: "Produto", type: "ME", family: "", subfamily: "", ncm: "", inclusionDate: "" };
    const result = await importCatalogRows({ pool, sourceKind: "SB1", fileName: "sb1.csv", content: "abc", rows: [row] });
    expect(result.rowCount).toBe(1); expect(queries[0]).toBe("begin"); expect(queries.some(x => x.startsWith("insert into public.operational_source_rows"))).toBe(true); expect(queries.at(-1)).toBe("commit");
  });
});
