import { describe, expect, it } from "vitest";
import { createOperationalSourceRowReader } from "./operationalSourceRowReader";

describe("operationalSourceRowReader", () => {
  it("passa as fontes como um único array para ANY($1::text[])", async () => {
    let params: unknown[] = [];
    const reader = createOperationalSourceRowReader({
      query: async (_sql, values) => { params = values ?? []; return { rows: [] }; },
    });
    await reader.listLatestProcessedBatchIds();
    expect(params).toHaveLength(1);
    expect(Array.isArray(params[0])).toBe(true);
    expect(params[0]).toEqual(["SB1", "SBZ", "SB5", "SA2", "PEDIDO_COMPRA", "NF_LEGAL", "FECHAMENTO_ESTOQUE"]);
  });
});
