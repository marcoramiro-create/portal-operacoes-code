import { describe, expect, it } from "vitest";
import { validateProtheusSource } from "./protheusSourceContracts";

describe("Protheus source contracts", () => {
  it("aceita SB1 usando aliases do Protheus", () => {
    const result = validateProtheusSource("SB1", "a\nb\nB1_COD;B1_DESC\nP1;Produto 1\n");
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.canonicalHeaders).toEqual(["CODIGO_PRODUTO", "DESCRICAO"]);
  });

  it("valida SA5 exigindo fornecedor, loja e produto externo", () => {
    const result = validateProtheusSource("SA5", "a\nb\nA5_FORNECE;A5_LOJA;A5_PRODUT\nF1;01;EXT1\n");
    expect(result.valid).toBe(true);
  });

  it("recusa SC7 sem filial e quantidade", () => {
    const result = validateProtheusSource("SC7", "a\nb\nC7_NUM;C7_PRODUTO\n100;P1\n");
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(["FILIAL", "QUANTIDADE"]));
  });

  it("recusa fonte vazia mesmo com cabeçalho completo", () => {
    const result = validateProtheusSource("SBZ", "a\nb\nBZ_COD;BZ_FILIAL\n");
    expect(result.valid).toBe(false);
    expect(result.warnings).toContain("A fonte não possui registros de dados.");
  });
});
