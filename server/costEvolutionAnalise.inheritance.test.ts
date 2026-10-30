import { describe, expect, it } from "vitest";
import { aplicarHerancaDeCusto } from "./costEvolutionAnalise";

describe("herança mensal de custo", () => {
  it("marca abril como herdado quando a SB9 traz zero e mantém maio como novo custo", () => {
    const item = {
      codigo: "00004",
      filial: "0101",
      cod_agregado: "00004",
      meses: [
        { period: "202603", custo_medio: 8.58 },
        { period: "202604", custo_medio: 0 },
        { period: "202605", custo_medio: 10.047 },
      ],
    };

    aplicarHerancaDeCusto(item, ["202603", "202604", "202605"]);

    expect(item.meses[0]).toMatchObject({ custo_medio: 8.58, custo_herdado: false });
    expect(item.meses[1]).toMatchObject({ custo_medio: 8.58, custo_herdado: true });
    expect(item.meses[2]).toMatchObject({ custo_medio: 10.047, custo_herdado: false });
  });

  it("não inventa custo antes da primeira observação positiva", () => {
    const item = {
      codigo: "07387",
      filial: "0101",
      cod_agregado: "07387",
      meses: [
        { period: "202603", custo_medio: 0 },
        { period: "202604", custo_medio: 0 },
        { period: "202605", custo_medio: 12 },
      ],
    };

    aplicarHerancaDeCusto(item, ["202603", "202604", "202605"]);

    expect(item.meses[0]).toMatchObject({ custo_medio: 0 });
    expect(item.meses[0].custo_herdado).not.toBe(true);
    expect(item.meses[1]).toMatchObject({ custo_medio: 0 });
    expect(item.meses[1].custo_herdado).not.toBe(true);
    expect(item.meses[2]).toMatchObject({ custo_medio: 12, custo_herdado: false });
  });
});
