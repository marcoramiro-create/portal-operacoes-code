import { describe, expect, it } from "vitest";
import {
  buildCostSalesHistoryIndex,
  costSalesCodeAliases,
  getCostSalesHistoryQuantity,
  normalizeCostSalesBranch,
  normalizeCostSalesPeriod,
} from "./costSalesHistory";

describe("costSalesHistory", () => {
  it("normaliza filial, períodos aceitos e aliases sem remover sufixos", () => {
    expect(normalizeCostSalesBranch("101")).toBe("0101");
    expect(normalizeCostSalesBranch("0101")).toBe("0101");
    expect(normalizeCostSalesPeriod("202501")).toBe("202501");
    expect(normalizeCostSalesPeriod("2025-10")).toBe("202510");
    expect(normalizeCostSalesPeriod("11/2025")).toBe("202511");
    expect(normalizeCostSalesPeriod("Abr/2026")).toBe("202604");
    expect(normalizeCostSalesPeriod("novembro 2025")).toBe("202511");
    expect(normalizeCostSalesPeriod("202513")).toBeNull();
    expect(normalizeCostSalesPeriod("13/2025")).toBeNull();

    expect(costSalesCodeAliases("00004-MGT", null)).toEqual(["00004-MGT", "4-MGT"]);
    expect(costSalesCodeAliases("4-MGT", "00004-MGT")).toEqual(["4-MGT", "00004-MGT"]);
  });

  it("seleciona a quantidade mais nova por filial, código e mês sem apagar meses ausentes", () => {
    const index = buildCostSalesHistoryIndex([
      {
        branch: "101",
        code: "00004-MGT",
        codeOriginal: "00004-MGT",
        salesMonths: { "01/2025": 51, "12/2025": 12 },
        importedAt: "2025-01-31T10:00:00Z",
        importId: 51,
      },
      {
        branch: "0101",
        code: "4-MGT",
        codeOriginal: "00004-MGT",
        salesMonths: { "out/2025": 63, "12/2025": 63 },
        importedAt: "2025-10-31T10:00:00Z",
        importId: 63,
      },
      {
        branch: "0101",
        code: "00004-MGT",
        salesMonths: { "2025-10": 64, "nov/2025": 0 },
        importedAt: new Date("2025-11-30T10:00:00Z"),
        importId: 64,
      },
    ]);

    expect(index.get("0101|00004-MGT|202501")).toBe(51);
    expect(getCostSalesHistoryQuantity(index, "101", "00004-MGT", "202501")).toBe(51);
    expect(getCostSalesHistoryQuantity(index, "0101", "4-MGT", "202510")).toBe(64);
    expect(getCostSalesHistoryQuantity(index, "0101", "00004-MGT", "nov/2025")).toBe(0);
    expect(getCostSalesHistoryQuantity(index, "0101", "00004-MGT", "202512")).toBe(63);
  });

  it("mantém zero como quantidade real e ignora nulos, brancos e valores/períodos inválidos", () => {
    const index = buildCostSalesHistoryIndex([
      {
        branch: "0101",
        code: "00004-MGT",
        salesMonths: { "2025-12": 7 },
        importedAt: "2025-12-01T00:00:00Z",
        importId: 1,
      },
      {
        branch: "0101",
        code: "00004-MGT",
        salesMonths: {
          "2025-12": 0,
          "2026-01": null,
          "2026-02": "",
          "2026-03": "não numérico",
          "2026-04": Number.NaN,
          "13/2026": 99,
        },
        importedAt: "2026-01-01T00:00:00Z",
        importId: 2,
      },
    ]);

    expect(getCostSalesHistoryQuantity(index, "0101", "4-MGT", "202512")).toBe(0);
    expect(getCostSalesHistoryQuantity(index, "0101", "00004-MGT", "202601")).toBeNull();
    expect(getCostSalesHistoryQuantity(index, "0101", "00004-MGT", "202602")).toBeNull();
    expect(getCostSalesHistoryQuantity(index, "0101", "00004-MGT", "202603")).toBeNull();
    expect(getCostSalesHistoryQuantity(index, "0101", "00004-MGT", "202613")).toBeNull();
  });

  it("usa importId como desempate quando importedAt é igual", () => {
    const index = buildCostSalesHistoryIndex([
      {
        branch: "0101",
        code: "00004-MGT",
        salesMonths: { "2025-01": 10 },
        importedAt: "2025-02-01T00:00:00Z",
        importId: 10,
      },
      {
        branch: "0101",
        code: "00004-MGT",
        salesMonths: { "2025-01": 11 },
        importedAt: "2025-02-01T00:00:00Z",
        importId: 11,
      },
    ]);

    expect(getCostSalesHistoryQuantity(index, "0101", "00004-MGT", "202501")).toBe(11);
  });

  it("falha claramente para duplicidade conflitante na mesma carga, chave e mês", () => {
    expect(() => buildCostSalesHistoryIndex([
      {
        branch: "0101",
        code: "00004-MGT",
        salesMonths: { "2025-01": 10 },
        importedAt: "2025-01-31T00:00:00Z",
        importId: 70,
        rowId: 7001,
      },
      {
        branch: "101",
        code: "4-MGT",
        codeOriginal: "00004-MGT",
        salesMonths: { "01/2025": 11 },
        importedAt: "2025-01-31T00:00:00Z",
        importId: 70,
        rowId: 7002,
      },
    ])).toThrowError(/Duplicidade conflitante na mesma carga: importId 70, chave 0101\|(00004-MGT|4-MGT), período 202501/);
  });
});
