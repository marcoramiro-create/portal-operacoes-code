import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseProtheusWorkbook } from "./protheusImport";

function workbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Planilha1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

const headers = ["Codigo", "Descricao", "Filial", "Qtd13M", "Estoque", "Classe ABC", "Cobertura (Dias)", "Excedente (R$)"];

describe("leitura da planilha Protheus", () => {
  it("usa a primeira coluna Classe ABC como curva ABCDE", () => {
    const buffer = workbookBuffer([headers, ["001", "Item", "0101", 120, 30, "D", 12.5, 450]]);
    const [record] = parseProtheusWorkbook(buffer);
    expect(record).toMatchObject({ code: "001", branch: "0101", curve: "D", sales13M: 120, stock: 30, coverageDays: 12.5, excessValue: 450 });
  });

  it("rejeita a ausência de uma coluna obrigatória", () => {
    const buffer = workbookBuffer([["Codigo", "Descricao"], ["001", "Item"]]);
    expect(() => parseProtheusWorkbook(buffer)).toThrow("colunas obrigatórias");
  });
});
