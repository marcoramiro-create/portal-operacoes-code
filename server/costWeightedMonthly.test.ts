import { describe, expect, it } from "vitest";
import { calculateWeightedMonthlyCost, materializeCalendarMonths } from "./costWeightedMonthly";

describe("materializeCalendarMonths", () => {
  it("materializa fevereiro e março quando o intervalo informado tem janeiro e abril", () => {
    expect(materializeCalendarMonths(["202501", "202504"])).toEqual([
      "202501",
      "202502",
      "202503",
      "202504",
    ]);
  });

  it("materializa meses ausentes e ignora períodos inválidos", () => {
    expect(materializeCalendarMonths(["202503", "202501", "202513", "202502"])).toEqual([
      "202501",
      "202502",
      "202503",
    ]);
  });
});

describe("calculateWeightedMonthlyCost", () => {
  it("carrega janeiro para fevereiro e março, compara mês a mês e usa novo custo em abril", () => {
    const result = calculateWeightedMonthlyCost({
      segment: "auto_parts",
      periods: ["202501", "202504"],
      aggregates: [{
        branch: "0101",
        aggregateCode: "0007-A",
        curve: "A",
        monthlyCosts: { "202501": 100, "202504": 120 },
        monthlyWeights: { "202502": 10, "202503": 20, "202504": 30 },
      }],
    });

    expect(result.periods).toEqual(["202501", "202502", "202503", "202504"]);
    expect(result.aggregates[0].points).toEqual([
      { period: "202501", cost: 100, weight: null, variationPercent: null, includedInWeight: false },
      { period: "202502", cost: 100, weight: 10, variationPercent: 0, includedInWeight: true },
      { period: "202503", cost: 100, weight: 20, variationPercent: 0, includedInWeight: true },
      { period: "202504", cost: 120, weight: 30, variationPercent: 20, includedInWeight: true },
    ]);
    expect(result.byCurve.A.weightedVariationPercent).toBeCloseTo(10);
    expect(result.total.weightedVariationPercent).toBeCloseTo(10);
    expect(result.total.weight).toBe(60);
  });

  it("nunca compara janeiro diretamente com março quando fevereiro está sem custo", () => {
    const result = calculateWeightedMonthlyCost({
      segment: "auto_parts",
      periods: ["202501", "202503"],
      aggregates: [{
        branch: "0101",
        aggregateCode: "0008",
        curve: "B",
        monthlyCosts: { "202501": 100, "202503": 130 },
        monthlyWeights: { "202502": 10, "202503": 10 },
      }],
    });

    expect(result.periods).toEqual(["202501", "202502", "202503"]);
    expect(result.aggregates[0].points[1].variationPercent).toBe(0);
    expect(result.aggregates[0].points[2].variationPercent).toBeCloseTo(30);
  });

  it("calcula média por curva e total usando pesos de venda diferentes", () => {
    const result = calculateWeightedMonthlyCost({
      segment: "auto_parts",
      periods: ["202501", "202502"],
      aggregates: [
        { branch: "0101", aggregateCode: "0007", curve: "A", monthlyCosts: { "202501": 100, "202502": 110 }, monthlyWeights: { "202502": 10 } },
        { branch: "0101", aggregateCode: "0008", curve: "B", monthlyCosts: { "202501": 100, "202502": 120 }, monthlyWeights: { "202502": 20 } },
      ],
    });

    expect(result.byCurve.A.weightedVariationPercent).toBeCloseTo(10);
    expect(result.byCurve.B.weightedVariationPercent).toBeCloseTo(20);
    expect(result.total.weightedVariationPercent).toBeCloseTo(16.6666667);
    expect(result.total.aggregates).toBe(2);
  });

  it("aceita somente ABC para Indústria e preserva o peso como valor de consumo", () => {
    const result = calculateWeightedMonthlyCost({
      segment: "industry",
      periods: ["202501", "202502"],
      aggregates: [
        { branch: "0105", aggregateCode: "03545", curve: "A", monthlyCosts: { "202501": 50, "202502": 50 }, monthlyWeights: { "202502": 4000 } },
        { branch: "0105", aggregateCode: "03546", curve: "D", monthlyCosts: { "202501": 50, "202502": 55 }, monthlyWeights: { "202502": 4000 } },
      ],
    });

    expect(Object.keys(result.byCurve)).toEqual(["A", "B", "C"]);
    expect(result.byCurve.A.weightedVariationPercent).toBe(0);
    expect(result.byCurve.A.weight).toBe(4000);
    expect(result.excluded.missingCurve).toBe(1);
  });

  it("retorna sem base quando não existe custo positivo dentro do intervalo", () => {
    const result = calculateWeightedMonthlyCost({
      segment: "auto_parts",
      periods: ["202501", "202504"],
      aggregates: [{
        branch: "0101",
        aggregateCode: "07387",
        curve: "C",
        monthlyCosts: { "202412": 90, "202501": 0, "202504": null },
        monthlyWeights: { "202502": 2, "202503": 3, "202504": 4 },
      }],
    });

    expect(result.periods).toEqual(["202501", "202502", "202503", "202504"]);
    expect(result.aggregates).toHaveLength(0);
    expect(result.total.aggregates).toBe(0);
    expect(result.excluded.noPositiveCostInPeriod).toBe(1);
  });

  it("ignora peso ausente ou zero, mas mantém o custo carregado nos meses seguintes", () => {
    const result = calculateWeightedMonthlyCost({
      segment: "auto_parts",
      periods: ["202501", "202504"],
      aggregates: [{
        branch: "0101",
        aggregateCode: "0002",
        curve: "D",
        monthlyCosts: { "202501": 10, "202504": 12 },
        monthlyWeights: { "202502": 0, "202503": undefined, "202504": 2 },
      }],
    });

    expect(result.aggregates[0].points[1].cost).toBe(10);
    expect(result.aggregates[0].points[2].cost).toBe(10);
    expect(result.aggregates[0].points[1].includedInWeight).toBe(false);
    expect(result.aggregates[0].points[2].includedInWeight).toBe(false);
    expect(result.byCurve.D.weight).toBe(2);
    expect(result.byCurve.D.weightedVariationPercent).toBeCloseTo(20);
  });

  it("exclui agregado quando todos os pesos são ausentes ou zero", () => {
    const result = calculateWeightedMonthlyCost({
      segment: "auto_parts",
      periods: ["202501", "202502"],
      aggregates: [{
        branch: "0101",
        aggregateCode: "0003",
        curve: "E",
        monthlyCosts: { "202501": 10, "202502": 12 },
        monthlyWeights: { "202502": 0 },
      }],
    });

    expect(result.total.aggregates).toBe(0);
    expect(result.excluded.missingWeight).toBe(1);
  });

  it("preserva código com zeros à esquerda e sufixo textual", () => {
    const result = calculateWeightedMonthlyCost({
      segment: "auto_parts",
      periods: ["202501", "202502"],
      aggregates: [{
        branch: "0105",
        aggregateCode: "00035-A",
        curve: "E",
        monthlyCosts: { "202501": 10, "202502": 9 },
        monthlyWeights: { "202502": 1 },
      }],
    });

    expect(result.aggregates[0].aggregateCode).toBe("00035-A");
    expect(result.total.aggregates).toBe(1);
    expect(result.byCurve.E.weightedVariationPercent).toBeCloseTo(-10);
  });
});
