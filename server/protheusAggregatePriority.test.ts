import { describe, expect, it } from "vitest";
import { purchaseAggregateKey } from "./protheusCalculations";
import { enriquecerCompras } from "./protheusImport";

describe("prioridade do código agregado em Compras", () => {
  it("mantém a filial na chave do agregado", () => {
    expect(purchaseAggregateKey("0101", "00000136")).toBe("0101|136");
    expect(purchaseAggregateKey("0105", "00000136")).toBe("0105|136");
  });

  it("prefere o registro SB1 indexado pelo agregado ao código individual", () => {
    const row = { codigo: "136", filial: "0101", descricao: "Compras", } as any;
    const result = enriquecerCompras(
      [row],
      {
        porCodigo: new Map([["136", { descricao: "Produto individual", tipo: "IND", familiaCode: "", subfamiliaCode: "" }]]),
        porCodAgregado: new Map([["136", { descricao: "Agregado gerencial", tipo: "AGR", familiaCode: "", subfamiliaCode: "" }]]),
        registros: [],
      } as any,
      { porChave: new Map() },
      new Map(),
      new Map(),
    );

    expect(result[0]).toMatchObject({ descricao: "Agregado gerencial", tipo: "AGR" });
  });
});
