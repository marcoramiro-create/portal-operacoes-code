import { describe, expect, it } from "vitest";
import { filterCostEvolutionItems, scopeCostEvolutionItems } from "./costEvolutionItemFilter";

const rows = [
  { codigo: "00899", cod_agregado: "00899", filial: "0101", descricao: "AGREGADO 00899" },
  { codigo: "07387", cod_agregado: "00899", filial: "0101", descricao: "MEMBRO LEGÍTIMO" },
  { codigo: "00899", cod_agregado: "01000", filial: "0101", descricao: "PRODUTO COM MESMO CÓDIGO, MAS OUTRO AGREGADO" },
  { codigo: "00111", cod_agregado: "100899", filial: "0101", descricao: "PREFIXO PARECIDO" },
  { codigo: "00112", cod_agregado: "00899-MGT", filial: "0101", descricao: "SUFIXO DIFERENTE" },
  { codigo: "00113", cod_agregado: "000899", filial: "0101", descricao: "ZERO EXTRA" },
  { codigo: "07387", cod_agregado: "00899", filial: "0103", descricao: "" },
];

describe("escopo da Evolução de Custos", () => {
  it("filtra agregado exato após enriquecimento e mantém todos os membros legítimos", () => {
    const result = scopeCostEvolutionItems(rows, { codAgregado: "00899" });
    expect(result).toHaveLength(3);
    expect(result.every(row => row.cod_agregado === "00899")).toBe(true);
    expect(result.map(row => row.codigo)).toContain("07387");
    expect(result).not.toContain(rows[2]);
  });
  it("restringe também a filial e ignora espaços de borda", () => {
    expect(scopeCostEvolutionItems(rows, { codAgregado: " 00899 ", filial: "0101" })).toEqual(rows.slice(0, 2));
  });
  it("não remove nem acrescenta linhas quando não há filtro", () => {
    expect(scopeCostEvolutionItems(rows, {})).toBe(rows);
    expect(filterCostEvolutionItems(rows, "")).toBe(rows);
  });
  it("um código numérico digitado aplica agregado exato, nunca prioridade do produto", () => {
    expect(filterCostEvolutionItems(rows, "00899")).toEqual([rows[0], rows[1], rows[6]]);
    expect(filterCostEvolutionItems(rows, "899")).toEqual([]);
  });
  it("não transforma zeros ou sufixos em equivalência", () => {
    expect(filterCostEvolutionItems(rows, "00899-MGT")).toEqual([rows[4]]);
    expect(filterCostEvolutionItems(rows, "000899")).toEqual([rows[5]]);
  });
  it("mantém itens corretamente vinculados que não têm descrição, sem inventá-la", () => {
    expect(scopeCostEvolutionItems(rows, { codAgregado: "00899", filial: "0103" })).toEqual([rows[6]]);
  });
  it("mantém busca por texto multi-termo e os tipos inicia/termina", () => {
    expect(filterCostEvolutionItems(rows, "membro leg")).toEqual([rows[1]]);
    expect(filterCostEvolutionItems(rows, "membro", "inicia")).toEqual([rows[1]]);
    expect(filterCostEvolutionItems(rows, "legítimo", "termina")).toEqual([rows[1]]);
  });
  it("usa código de produto somente como fallback quando o agregado não foi fornecido", () => {
    const noAggregate = [{ codigo: "00899", cod_agregado: null, filial: "0101" }];
    expect(scopeCostEvolutionItems(noAggregate, { codAgregado: "00899" })).toEqual(noAggregate);
    expect(scopeCostEvolutionItems(noAggregate, { codAgregado: "0089" })).toEqual([]);
  });
});
