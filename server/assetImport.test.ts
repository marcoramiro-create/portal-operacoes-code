import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseAssetWorkbook } from "./assetImport";

function workbookBase64(rows: Array<Record<string, unknown>>) { const sheet = XLSX.utils.json_to_sheet(rows); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "Ativos"); return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })).toString("base64"); }

describe("asset import preview", () => {
  it("accepts required code/name and maps industrial fields", () => { const result = parseAssetWorkbook(workbookBase64([{ codigo: "EQ-01", nome: "Compressor", criticidade: "high", setor: "Utilidades" }]), "industrial_equipment"); expect(result.errors).toEqual([]); expect(result.rows[0]).toMatchObject({ code: "EQ-01", name: "Compressor", criticality: "high", sector: "Utilidades" }); });
  it("reports rows without code or name instead of fabricating values", () => { const result = parseAssetWorkbook(workbookBase64([{ codigo: "", nome: "" }, { codigo: "EMP-01", nome: "Empilhadeira", numero_serie: "SN-1" }]), "forklift"); expect(result.rows).toHaveLength(1); expect(result.errors).toEqual(["Linha 2: código e nome são obrigatórios."]); expect(result.rows[0]?.serialNumber).toBe("SN-1"); });
});
