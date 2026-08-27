import { describe, expect, it } from "vitest";
import { assertOperationLines, requisitionStatus } from "./inventoryOperations";

describe("regras de operações de almoxarifado", () => {
  it("calcula corretamente o status após atendimento parcial ou completo", () => {
    expect(requisitionStatus(10, 0)).toBe("open");
    expect(requisitionStatus(10, 4)).toBe("partial");
    expect(requisitionStatus(10, 10)).toBe("completed");
  });

  it("rejeita quantidade inválida e repetição de item e tamanho", () => {
    expect(() => assertOperationLines([{ productId: "produto", quantity: 0 }])).toThrow("maiores que zero");
    expect(() => assertOperationLines([{ productId: "produto", quantity: 1, sizeCode: "M" }, { productId: "produto", quantity: 1, sizeCode: "M" }])).toThrow("Não repita");
  });
});
