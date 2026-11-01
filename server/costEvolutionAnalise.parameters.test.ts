import { describe, expect, it, vi } from "vitest";
import { obterConsumoIndustria } from "./costEvolutionAnalise";

describe("parâmetros SQL do consumo industrial", () => {
  it("usa o terceiro parâmetro como filial no consumo e o primeiro no estoque", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await obterConsumoIndustria({ query } as unknown as Parameters<typeof obterConsumoIndustria>[0], ["202501", "202609"], "TEST_PARAMETERS_0105");
    expect(query).toHaveBeenCalledTimes(2);
    const [consumoSql, consumoParams] = query.mock.calls[0];
    expect(consumoParams).toEqual(["202412", "202609", "TEST_PARAMETERS_0105"]);
    expect(consumoSql.match(/r\.branch_code = \$3/g)).toHaveLength(2);
    expect(consumoSql).toContain("s.period BETWEEN $1 AND $2");
    const [estoqueSql, estoqueParams] = query.mock.calls[1];
    expect(estoqueParams).toEqual(["TEST_PARAMETERS_0105"]);
    expect(estoqueSql).toContain("r.branch_code = $1");
    for (const [sql, params] of query.mock.calls) {
      const placeholders = [...sql.matchAll(/\$(\d+)/g)].map(match => Number(match[1]));
      expect(Math.max(...placeholders)).toBe(params.length);
    }
  });
});
