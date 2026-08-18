import { describe, expect, it } from "vitest";
import { calculateStockQuantity, validateDeliveryReceipt } from "./logisticsRules";

describe("regras de estoque", () => {
  it("soma a quantidade em uma entrada", () => {
    expect(calculateStockQuantity(12, "entrada", 8)).toBe(20);
  });

  it("impede uma saída acima da quantidade disponível", () => {
    expect(() => calculateStockQuantity(4, "saida", 5)).toThrow("A saída não pode superar a quantidade disponível.");
  });
});

describe("regras de recebimento", () => {
  it("exige data realizada quando a entrega foi recebida", () => {
    expect(() => validateDeliveryReceipt("recebido")).toThrow("Informe a data realizada para um recebimento concluído.");
  });

  it("aceita uma entrega pendente sem data realizada", () => {
    expect(() => validateDeliveryReceipt("pendente")).not.toThrow();
  });
});
