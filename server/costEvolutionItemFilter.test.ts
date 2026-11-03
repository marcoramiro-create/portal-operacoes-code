import { describe, expect, it } from "vitest";
import { filterCostEvolutionItems } from "./costEvolutionItemFilter";

const rows = [
  { codigo: "00899", cod_agregado: "00900", descricao: "ITEM 00899" },
  { codigo: "18899", cod_agregado: "00899", descricao: "OUTRO ITEM DO AGREGADO 00899" },
  { codigo: "00899-MGT", cod_agregado: "00900", descricao: "ITEM COM SUFIXO" },
  { codigo: "00899", cod_agregado: "00900", descricao: "" , filial: "0203" },
  { codigo: "000899", cod_agregado: "100899", descricao: "CÓDIGO COM ZERO A MAIS" },
  { codigo: "00075", cod_agregado: "00890", descricao: "MEMBRO DO AGREGADO EXATO" },
  { codigo: "00076", cod_agregado: "100890", descricao: "MEMBRO DE OUTRO AGREGADO" },
];

describe("filterCostEvolutionItems", () => {
  it("trata 00899 como código exato de produto e não inclui o grupo de mesmo nome", () => {
    const result = filterCostEvolutionItems(rows, "00899");
    expect(result).toHaveLength(2);
    expect(result.every(row => row.codigo === "00899")).toBe(true);
  });

  it("preserva os zeros à esquerda e não usa prefixo ou sufixo como equivalência", () => {
    expect(filterCostEvolutionItems(rows, "899")).toEqual([]);
    expect(filterCostEvolutionItems(rows, "00899-MGT").map(row => row.codigo)).toEqual(["00899-MGT"]);
    expect(filterCostEvolutionItems(rows, "000899").map(row => row.codigo)).toEqual(["000899"]);
  });

  it("when product code does not exist, returns only exact aggregate members", () => {
    const result = filterCostEvolutionItems(rows, "00890");
    expect(result.map(row => row.codigo)).toEqual(["00075"]);
    expect(result.some(row => row.cod_agregado === "100890")).toBe(false);
  });

  it("keeps free-text description search partial and never matches undocumented rows", () => {
    const result = filterCostEvolutionItems(rows, "outro item");
    expect(result.map(row => row.codigo)).toEqual(["18899"]);
    expect(filterCostEvolutionItems(rows, "descrição inexistente")).toEqual([]);
  });
});
