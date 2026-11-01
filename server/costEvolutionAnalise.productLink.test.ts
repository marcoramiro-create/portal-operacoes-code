import { describe, expect, it } from "vitest";
import { mesmoProdutoSb9 } from "./costEvolutionAnalise";

describe("vínculo SB9 por filial e produto", () => {
  it("não aceita qualquer produto da mesma filial", () => {
    const items = [{ filial: "0101", codigo: "00004" }, { filial: "0101", codigo: "07387" }];
    expect(items.find(item => mesmoProdutoSb9(item, "0101", "07387"))).toBe(items[1]);
    expect(mesmoProdutoSb9(items[0], "0101", "07387")).toBe(false);
  });
  it("não cruza o mesmo produto entre filiais", () => {
    expect(mesmoProdutoSb9({ filial: "0105", codigo: "00004" }, "0101", "00004")).toBe(false);
  });
  it("mantém os aliases legados de filial e sufixo", () => {
    expect(mesmoProdutoSb9({ filial: "101", codigo: "00004-MGT" }, "0101", "00004")).toBe(true);
  });
});
