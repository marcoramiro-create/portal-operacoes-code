import { describe, expect, it } from "vitest";
import { assertOperationLines, requisitionStatus, requiresEmployeeItemCustody, saveStockPolicy } from "./inventoryOperations";

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

  it("mantém as regras de níveis de estoque no contrato de entrada", async () => {
    const caller = (await import("./routers")).appRouter.createCaller({} as never);
    await expect(caller.inventoryOperations.saveStockPolicy({ warehouseId: "invalido", productId: "invalido", minimumQuantity: 0, safetyDays: 30, coverageDays: 60 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("valida os filtros de data do histórico de responsabilidades", async () => {
    const caller = (await import("./routers")).appRouter.createCaller({} as never);
    await expect(caller.inventoryOperations.employeeCustodies({ from: "data-invalida" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("cria responsabilidade somente para categorias explícitas de EPI e uniforme", () => {
    expect(requiresEmployeeItemCustody("epi")).toBe(true);
    expect(requiresEmployeeItemCustody("uniform")).toBe(true);
    expect(requiresEmployeeItemCustody("tool")).toBe(false);
    expect(requiresEmployeeItemCustody("outro texto")).toBe(false);
  });
});
