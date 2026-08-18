import { describe, expect, it } from "vitest";
import { calculateTurnover } from "./analyticsRules";

describe("cálculo de giro", () => {
  it("divide as vendas financeiras acumuladas pelo estoque financeiro", () => {
    expect(calculateTurnover(120000, 30000)).toBe(4);
  });

  it("retorna zero quando não há estoque financeiro", () => {
    expect(calculateTurnover(120000, 0)).toBe(0);
  });
});
