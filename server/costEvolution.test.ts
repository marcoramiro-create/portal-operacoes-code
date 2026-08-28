import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { normalizeRmBisText, parseCostEvolutionWorkbook } from "./costEvolution";

const fixture = (name: string) => path.join("/home/ubuntu/upload", name);

describe("costEvolution", () => {
  it("aplica limpeza equivalente a ARRUMAR sem retirar zeros de códigos", () => {
    expect(normalizeRmBisText("  00004      MGT  ")).toBe("00004 MGT");
  });

  it("lê as planilhas reais de autopeças e indústria, ignora totais e mantém zero como observação", () => {
    const autoParts = parseCostEvolutionWorkbook(
      "AcompanhamentodeCustos-Peças-202501+.xlsx",
      fs.readFileSync(fixture("AcompanhamentodeCustos-Peças-202501+.xlsx")),
      "auto_parts",
    );
    const industry = parseCostEvolutionWorkbook(
      "AcompanhamentodeCustos-Indústria-202501+.xlsx",
      fs.readFileSync(fixture("AcompanhamentodeCustos-Indústria-202501+.xlsx")),
      "industry",
    );

    expect(autoParts.itemCount).toBe(8679);
    expect(autoParts.dateColumns).toHaveLength(19);
    expect(autoParts.periodStart).toBe("2025-01-31");
    expect(autoParts.periodEnd).toBe("2026-07-31");
    expect(autoParts.issues).toEqual([]);
    expect(autoParts.rows[0]).toMatchObject({ branch: "0101", aggregateCode: "00004", code: "00004", mrp: "Sim" });
    expect(autoParts.rows[0].description).toBe("TEE UNIAO EMENDA OD. 08MM");
    expect(autoParts.rows[0].observations).toContainEqual({ balanceDate: "2025-01-31", cost: 8.5798 });
    expect(autoParts.rows.find(row => row.code === "00027")?.observations).toContainEqual({ balanceDate: "2025-01-31", cost: 0 });

    expect(industry.itemCount).toBe(3307);
    expect(industry.dateColumns).toHaveLength(19);
    expect(industry.issues).toEqual([]);
    expect(new Set(industry.rows.map(row => row.branch))).toEqual(new Set(["0105"]));
  });

  it("rejeita arquivo sem os cabeçalhos obrigatórios", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["OUTRO"], ["valor"]]), "Sheet");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    expect(() => parseCostEvolutionWorkbook("invalido.xlsx", buffer, "industry")).toThrow("FILIAL");
  });
});
