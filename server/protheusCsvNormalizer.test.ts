import { describe, expect, it } from "vitest";
import { normalizeProtheusCsv } from "./protheusCsvNormalizer";

describe("Protheus CSV normalizer", () => {
  it("lê cabeçalho na terceira linha, remove BOM e normaliza nomes", () => {
    const result = normalizeProtheusCsv("Relatório\nGerado em\n\uFEFFCódigo; Descrição do Produto ; Filial\n P1 ; Parafuso ; 0101\n");
    expect(result.delimiter).toBe(";");
    expect(result.headerRow).toBe(3);
    expect(result.headers).toEqual(["CODIGO", "DESCRICAO_DO_PRODUTO", "FILIAL"]);
    expect(result.rows[0]).toEqual({ CODIGO: "P1", DESCRICAO_DO_PRODUTO: "Parafuso", FILIAL: "0101" });
    expect(result.issues).toHaveLength(0);
  });

  it("preserva aspas, separador interno e valores vazios", () => {
    const result = normalizeProtheusCsv("a\nb\nCOD;NOME;OBS\nP1;\"Porca; grande\";\"linha \"\"especial\"\"\"\n");
    expect(result.rows[0]).toEqual({ COD: "P1", NOME: "Porca; grande", OBS: 'linha "especial"' });
  });

  it("detecta cabeçalho duplicado e linha com colunas extras", () => {
    const result = normalizeProtheusCsv("a\nb\nCOD;COD;NOME\nP1;P1;Produto;EXTRA\n");
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(["DUPLICATE_HEADER", "INVALID_ROW"]));
  });

  it("detecta ausência do cabeçalho esperado", () => {
    const result = normalizeProtheusCsv("somente uma linha\n");
    expect(result.issues[0].code).toBe("HEADER_NOT_FOUND");
    expect(result.rows).toHaveLength(0);
  });
});
