import { describe, expect, it } from "vitest";
import { duplicateFindings } from "./auditIncrementalSync";

describe("auditIncrementalSync duplicates", () => {
  it("produces one finding per duplicated key and preserves the scope", () => {
    const result = duplicateFindings("SBZ", new Map([["0101|001", 2], ["0101|002", 1]]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ category: "DUPLICIDADE", scope: "SBZ.Filial+Codigo", sourceKey: "0101|001" });
  });
  it("covers order, SA2 and NF Legal scopes", () => {
    expect(duplicateFindings("PEDIDO_COMPRA", new Map([["0101|1|1", 2]]))[0]).toMatchObject({ scope: "Pedidos.Chave", source: "Pedidos" });
    expect(duplicateFindings("SA2", new Map([["123", 2]]))[0].scope).toBe("SA2.Documento");
    expect(duplicateFindings("NF_LEGAL", new Map([["NF-1", 2]]))[0].scope).toBe("NF_LEGAL.Documento");
  });
});
