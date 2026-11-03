import { describe, expect, it } from "vitest";
import { buildSb9CostSourceQuery } from "./sb9CostQuery";

describe("buildSb9CostSourceQuery", () => {
  it("consulta custos raw por batch, filial e intervalo de datas sem aplicar função às chaves indexadas", () => {
    const query = buildSb9CostSourceQuery("raw", {
      batchId: "batch-1",
      periodStart: "202501",
      periodEnd: "202609",
      branch: "0101",
    });
    expect(query.values).toEqual(["batch-1", "202501", "202609", "0101"]);
    expect(query.text).toContain("r.branch_code = $4");
    expect(query.text).toContain("r.event_date >= to_date($2, 'YYYYMM')");
    expect(query.text).toContain("r.event_date < to_date($3, 'YYYYMM') + interval '1 month'");
    expect(query.text).not.toMatch(/trim\(r\.(branch_code|product_code)\)/);
  });

  it("filtra código de produto exato, preservando zeros e sufixo textual", () => {
    const query = buildSb9CostSourceQuery("raw", {
      batchId: "batch-2",
      branch: "0105",
      productCodes: ["000123-MGT", "00899"],
    });
    expect(query.values).toEqual(["batch-2", "0105", ["000123-MGT", "00899"]]);
    expect(query.text).toContain("r.product_code = any($3::text[])");
  });

  it("consulta a tabela mensal por versão, filial, período e códigos sem tocar na fonte bruta", () => {
    const query = buildSb9CostSourceQuery("monthly", {
      batchId: "version-1",
      periodStart: "202501",
      periodEnd: "202609",
      branch: "0101",
      productCodes: ["000123-MGT"],
    });
    expect(query.values).toEqual(["version-1", "202501", "202609", "0101", ["000123-MGT"]]);
    expect(query.text).toContain("from public.cost_evolution_sb9_monthly r");
    expect(query.text).toContain("r.period >= $2");
    expect(query.text).toContain("r.period <= $3");
    expect(query.text).toContain("r.product_code = any($5::text[])");
    expect(query.text).not.toContain("operational_source_rows");
  });

  it("não emite filtros vazios que prejudiquem o plano do PostgreSQL", () => {
    const query = buildSb9CostSourceQuery("raw", { batchId: "batch-3" });
    expect(query.values).toEqual(["batch-3"]);
    expect(query.text).not.toMatch(/::text is null or/);
    expect(query.text).not.toMatch(/any\(\$\d+::text\[\]\)/);
  });
});
