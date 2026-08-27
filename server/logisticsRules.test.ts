import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseProtheusWorkbook } from "./protheusImport";
import { formatPurchaseVersionName, parsePurchaseHistoryDate } from "./db";

function workbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Planilha1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

const headers = ["Codigo", "Descricao", "Filial", "Tipo", "Qtd13M", "CustoTot13M", "Estoque", "Total R$", "Classe ABC", "Cobertura (Dias)", "Excedente (R$)", "Família", "SubFamília"];

describe("versionamento das cargas Protheus", () => {
  it("gera o nome Compras - aaaaMMddHHmm em UTC", () => {
    expect(formatPurchaseVersionName(new Date("2026-08-27T16:05:09.000Z"))).toBe("Compras - 202608271605");
  });

  it("extrai a data histórica UTC do nome original sem renomeá-lo", () => {
    expect(parsePurchaseHistoryDate("Compras - 202608271605.xlsx").toISOString()).toBe("2026-08-27T16:05:00.000Z");
  });

  it("rejeita nome fora do padrão histórico ou data impossível", () => {
    expect(() => parsePurchaseHistoryDate("Compras - 202608271605.xls")).toThrow("Compras - aaaaMMddHHmm.xlsx");
    expect(() => parsePurchaseHistoryDate("Compras - 202613321605.xlsx")).toThrow("data/hora");
  });
});

describe("leitura da planilha Protheus", () => {
  it("usa a primeira coluna Classe ABC como curva ABCDE e CustoTot13M como vendas financeiras", () => {
    const buffer = workbookBuffer([headers, ["001", "Item", "0101", "ME", 120, 3250.5, 30, 1400, "D", 12.5, 450, "Freios", "Discos"]]);
    const [record] = parseProtheusWorkbook(buffer);
    expect(record).toMatchObject({ code: "001", branch: "0101", productType: "ME", curve: "D", sales13M: 120, salesValue13M: 3250.5, stock: 30, stockValue: 1400, coverageDays: 12.5, excessValue: 450, family: "Freios", subfamily: "Discos" });
  });

  it("separa registros por MRP quando a coluna está presente", () => {
    const mrpHeaders = [...headers.slice(0, 4), "MRP", ...headers.slice(4)];
    const buffer = workbookBuffer([mrpHeaders, ["001", "Item", "0101", "ME", "Sim", 120, 3250.5, 30, 1400, "D", 12.5, 450, "Freios", "Discos"]]);
    const [record] = parseProtheusWorkbook(buffer);
    expect(record.mrp).toBe("Sim");
  });

  it("usa Não como padrão para versões sem a coluna MRP", () => {
    const buffer = workbookBuffer([headers, ["001", "Item", "0101", "ME", 120, 3250.5, 30, 1400, "D", 12.5, 450, "Freios", "Discos"]]);
    const [record] = parseProtheusWorkbook(buffer);
    expect(record.mrp).toBe("Não");
  });

  it("rejeita a ausência de uma coluna obrigatória", () => {
    const buffer = workbookBuffer([["Codigo", "Descricao"], ["001", "Item"]]);
    expect(() => parseProtheusWorkbook(buffer)).toThrow("colunas obrigatórias");
  });
});
