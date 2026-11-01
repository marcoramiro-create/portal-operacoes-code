import { describe, expect, it } from "vitest";
import { IndustryConsumptionAccumulator } from "./industryConsumptionMonthly";

describe("IndustryConsumptionAccumulator", () => {
  it("calcula janeiro usando o fechamento de dezembro e as entradas do mês", () => {
    const accumulator = new IndustryConsumptionAccumulator("202501", "202501");

    accumulator.addClosing({ branch: "0101", product: "0007", aggregate: "03545-A", period: "202412", value: 150 });
    accumulator.addClosing({ branch: "0101", product: "0007", aggregate: "03545-A", period: "202501", value: 100 });
    accumulator.addEntry({ branch: "0101", product: "0007", period: "202501", value: 20 });

    const result = accumulator.finish();

    expect(result.consumo).toEqual(new Map([["0101|03545-A|202501", 70]]));
  });

  it("não salta mês sem fechamento para calcular consumo", () => {
    const accumulator = new IndustryConsumptionAccumulator("202501", "202503");

    accumulator.addClosing({ branch: "0101", product: "0007", aggregate: "A", period: "202412", value: 150 });
    accumulator.addClosing({ branch: "0101", product: "0007", aggregate: "A", period: "202501", value: 100 });
    accumulator.addClosing({ branch: "0101", product: "0007", aggregate: "A", period: "202503", value: 80 });
    accumulator.addEntry({ branch: "0101", product: "0007", period: "202501", value: 20 });
    accumulator.addEntry({ branch: "0101", product: "0007", period: "202503", value: 5 });

    const result = accumulator.finish();

    expect(result.consumo).toEqual(new Map([["0101|A|202501", 70]]));
  });

  it("soma produtos que pertencem ao mesmo agregado e preserva o código", () => {
    const accumulator = new IndustryConsumptionAccumulator("202501", "202501");

    for (const product of ["0001", "0002"]) {
      accumulator.addClosing({ branch: "0105", product, aggregate: "00035-A", period: "202412", value: 100 });
      accumulator.addClosing({ branch: "0105", product, aggregate: "00035-A", period: "202501", value: 80 });
      accumulator.addEntry({ branch: "0105", product, period: "202501", value: 10 });
    }

    const result = accumulator.finish();

    expect(result.consumo).toEqual(new Map([["0105|00035-A|202501", 60]]));
    expect(result.consumo.has("0105|35-A|202501")).toBe(false);
  });

  it("aceita valores zero como dados válidos", () => {
    const accumulator = new IndustryConsumptionAccumulator("202501", "202501");

    accumulator.addClosing({ branch: "0101", product: "0000", aggregate: "0000-X", period: "202412", value: 0 });
    accumulator.addClosing({ branch: "0101", product: "0000", aggregate: "0000-X", period: "202501", value: 0 });
    accumulator.addEntry({ branch: "0101", product: "0000", period: "202501", value: 0 });

    const result = accumulator.finish();

    expect(result.consumo).toEqual(new Map([["0101|0000-X|202501", 0]]));
    expect(result.estoqueAgregado).toEqual(new Map([["0101|0000-X", 0]]));
  });

  it("retorna mapas vazios sem dados", () => {
    const result = new IndustryConsumptionAccumulator("202501", "202503").finish();

    expect(result).toEqual({ consumo: new Map(), estoqueAgregado: new Map() });
  });

  it("não produz consumo antes do início, mas usa fechamento anterior ao intervalo", () => {
    const accumulator = new IndustryConsumptionAccumulator("202501", "202502");

    accumulator.addClosing({ branch: "0101", product: "0007", aggregate: "A", period: "202411", value: 200 });
    accumulator.addClosing({ branch: "0101", product: "0007", aggregate: "A", period: "202412", value: 150 });
    accumulator.addClosing({ branch: "0101", product: "0007", aggregate: "A", period: "202501", value: 100 });
    accumulator.addClosing({ branch: "0101", product: "0007", aggregate: "A", period: "202502", value: 90 });
    accumulator.addEntry({ branch: "0101", product: "0007", period: "202412", value: 999 });
    accumulator.addEntry({ branch: "0101", product: "0007", period: "202501", value: 20 });
    accumulator.addEntry({ branch: "0101", product: "0007", period: "202502", value: 5 });

    const result = accumulator.finish();

    expect(result.consumo).toEqual(new Map([
      ["0101|A|202501", 70],
      ["0101|A|202502", 15],
    ]));
    expect(result.consumo.has("0101|A|202412")).toBe(false);
  });

  it("soma o saldo do último mês disponível por filial e agregado", () => {
    const accumulator = new IndustryConsumptionAccumulator("202501", "202503");

    accumulator.addClosing({ branch: "0101", product: "0001", aggregate: "A", period: "202501", value: 10 });
    accumulator.addClosing({ branch: "0101", product: "0001", aggregate: "A", period: "202503", value: 7 });
    accumulator.addClosing({ branch: "0101", product: "0002", aggregate: "A", period: "202502", value: 5 });
    accumulator.addClosing({ branch: "0101", product: "0003", aggregate: "B", period: "202503", value: 12 });
    accumulator.addClosing({ branch: "0102", product: "0004", aggregate: "A", period: "202503", value: 20 });

    const result = accumulator.finish();

    expect(result.estoqueAgregado).toEqual(new Map([
      ["0101|A", 12],
      ["0101|B", 12],
      ["0102|A", 20],
    ]));
  });

  it("limita o consumo a zero quando o saldo mais entradas não supera o fechamento", () => {
    const accumulator = new IndustryConsumptionAccumulator("202501", "202501");

    accumulator.addClosing({ branch: "0101", product: "0007", aggregate: "A", period: "202412", value: 10 });
    accumulator.addClosing({ branch: "0101", product: "0007", aggregate: "A", period: "202501", value: 20 });
    accumulator.addEntry({ branch: "0101", product: "0007", period: "202501", value: 1 });

    expect(accumulator.finish().consumo).toEqual(new Map([["0101|A|202501", 0]]));
  });

  it("valida períodos e valores finitos", () => {
    expect(() => new IndustryConsumptionAccumulator("202513", "202501")).toThrow();
    expect(() => new IndustryConsumptionAccumulator("202502", "202501")).toThrow();

    const accumulator = new IndustryConsumptionAccumulator("202501", "202501");
    expect(() => accumulator.addClosing({ branch: "0101", product: "P", aggregate: "A", period: "202500", value: 1 })).toThrow();
    expect(() => accumulator.addEntry({ branch: "0101", product: "P", period: "202501", value: Number.NaN })).toThrow();
    expect(() => accumulator.addEntry({ branch: "0101", product: "P", period: "202501", value: Number.POSITIVE_INFINITY })).toThrow();
  });
});
