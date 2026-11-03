import { afterEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => {
  const initialItems = [
    {
      filial: "0101",
      codigo: "M001",
      cod_agregado: "00899",
      descricao: "Membro legítimo com código de produto diferente do agregado",
      meses: [{ period: "202501", custo_medio: 10 }],
    },
  ];

  const cursorRows = [
    { branch: "0101", product: "00899", period: "202501", cost: "11" },
    { branch: "0101", product: "OUTRO", period: "202501", cost: "12" },
    { branch: "0101", product: "100899", period: "202501", cost: "13" },
    { branch: "0101", product: "00899-MGT", period: "202501", cost: "14" },
    { branch: "0101", product: "01001", period: "202501", cost: "15" },
  ];

  const catalogRows = [
    { product: "M001", aggregate: "00899", importedAt: "2026-11-01T00:00:00Z", sourceRow: 0 },
    { product: "00899", aggregate: "00899", importedAt: "2026-11-01T00:00:00Z", sourceRow: 1 },
    { description: "DESCRIÇÃO REAL SB1", product: "OUTRO", aggregate: "00899", importedAt: "2026-11-01T00:00:00Z", sourceRow: 2 },
    { product: "100899", aggregate: "100899", importedAt: "2026-11-01T00:00:00Z", sourceRow: 3 },
    { product: "00899-MGT", aggregate: "00899-MGT", importedAt: "2026-11-01T00:00:00Z", sourceRow: 4 },
    { product: "01001", aggregate: "01001", importedAt: "2026-11-01T00:00:00Z", sourceRow: 5 },
  ];

  const curves = cursorRows.map(({ product }) => ({
    code: product,
    codeOriginal: null,
    branchCode: "0101",
    curve: "A",
  }));

  const businessPool = {
    query: vi.fn(async (sql: unknown) => {
      const text = String(sql);
      if (text.includes("get_cost_evolution")) {
        return {
          rows: [{ result: {
            periodos: [{ period: "202501" }],
            items: structuredClone(initialItems),
          } }],
        };
      }
      if (text.includes("purchase_sales_monthly_head")) return { rows: [] };
      if (text.includes('"salesMonths"')) {
        return {
          rows: [{
            branch: "0101",
            code: "00899",
            codeOriginal: null,
            salesMonths: { "202501": 5 },
            importedAt: "2026-11-01T00:00:00Z",
            importId: 1,
            rowId: 1,
          }],
        };
      }
      if (text.includes('"stockValue"')) return { rows: [] };
      if (text.includes('inventoryAnalytics') && text.includes("curve")) return { rows: curves };
      throw new Error(`SQL de negócio não previsto: ${text}`);
    }),
  };

  const costSourcePool = { query: vi.fn(async (sql: unknown) => {
    const text = String(sql);
    if (text.includes("source_kind = 'SB9'") && text.includes("file_hash")) {
      return { rows: [{ id: "sb9-batch-1", file_hash: "sb9-hash-1" }] };
    }
    if (text.includes("cost_evolution_sb9_head")) return { rows: [] };
    if (text.includes("operational_import_batches") && text.includes("aggregate_product_code")) {
      return { rows: structuredClone(catalogRows) };
    }
    throw new Error(`SQL da fonte não previsto: ${text}`);
  }) };

  const sourceCursor = vi.fn(async function* () {
    for (const row of cursorRows) yield row;
  });

  const garantirIndices = vi.fn(async (_pool: unknown, periods: string[]) => ({
    IPCA: "ok" as const,
    DOLAR: "ok" as const,
    detalhes: {},
    periods,
  }));
  const getIndices = vi.fn(async () => ({
    IPCA: new Map([["202501", { valor: 0, valorFechamento: null }]]),
    DOLAR: new Map([["202501", { valor: 5, valorFechamento: 5 }]]),
  }));

  return { businessPool, costSourcePool, sourceCursor, garantirIndices, getIndices };
});

vi.mock("./supabasePortal", () => ({
  getBusinessPool: vi.fn(() => fixtures.businessPool),
  getSupabasePool: vi.fn(() => fixtures.costSourcePool),
}));
vi.mock("./costSourcePool", () => ({ getCostSourcePool: vi.fn(() => fixtures.costSourcePool) }));
vi.mock("./costSourceCursor", () => ({ streamCostSourceRows: fixtures.sourceCursor }));
vi.mock("./economicIndices", () => ({
  garantirIndicesEconomicos: fixtures.garantirIndices,
  getIndicesEconomicos: fixtures.getIndices,
}));
vi.mock("./costEvolutionBenchmarkAdapter", () => ({
  attachCostBenchmarkReport: vi.fn((result: any) => {
    for (const item of result.items ?? []) {
      item.curve = "A";
      item.costStatus = "COM_BASE";
    }
    result.benchmarkReport = {};
    return result;
  }),
}));
vi.mock("./costCurveHistory", () => ({ addLatestHistoricalCostCurves: vi.fn(async (_pool: unknown, lookup: unknown) => lookup) }));

afterEach(() => {
  fixtures.businessPool.query.mockClear();
  fixtures.costSourcePool.query.mockClear();
  fixtures.sourceCursor.mockClear();
  fixtures.garantirIndices.mockClear();
  fixtures.getIndices.mockClear();
});

import { getCostEvolutionAnalise, getCostEvolutionItens } from "./costEvolutionAnalise";

describe("escopo exato de codAgregado após attach da SB9 (auto_parts)", () => {
  it("summary filtra pelo agregado exato, mantém todos os membros e restringe o total", async () => {
    const baseline = await getCostEvolutionAnalise({
      periodoInicio: "202501",
      periodoFim: "202501",
      filial: "0101",
    } as never);
    const filtered = await getCostEvolutionAnalise({
      periodoInicio: "202501",
      periodoFim: "202501",
      filial: "0101",
      codAgregado: "00899",
    });

    expect(baseline.cards.custoTotal).toBe(180);
    expect(filtered.cards.custoTotal).toBe(165);
    expect(filtered.cards.comCusto).toBe(3);
    expect(filtered.benchmarkReport.byCurve.A.itemCount).toBe(3);
  });

  it("grid mantém membro OUTRO do agregado e exclui 100899, 00899-MGT e 01001", async () => {
    const baseline = await getCostEvolutionItens({
      periodoInicio: "202501",
      periodoFim: "202501",
      filial: "0101",
      itensPorPagina: 50,
      ordenacao: "codigo",
      direcao: "asc",
    });
    const filtered = await getCostEvolutionItens({
      periodoInicio: "202501",
      periodoFim: "202501",
      filial: "0101",
      codAgregado: "00899",
      itensPorPagina: 50,
      ordenacao: "codigo",
      direcao: "asc",
    });

    expect(baseline.total).toBe(5);
    expect(filtered.total).toBe(3);
    expect(filtered.items.map(item => item.codigo)).toEqual(["00899", "M001", "OUTRO"]);
    expect(filtered.items.every(item => item.cod_agregado === "00899")).toBe(true);
  });
  it("código digitado restringe a origem e a SB9 ao agregado exato", async () => {
    const filtered = await getCostEvolutionAnalise({ periodoInicio: "202501", periodoFim: "202501", filial: "0101", descricao: "00899" });
    expect(filtered.cards.custoTotal).toBe(165);
    const [pool, sql, params] = fixtures.sourceCursor.mock.calls.at(-1) as unknown as [unknown, string, unknown[]];
    expect(sql).toContain("any($5::text[])");
    expect(params[4]).toEqual(expect.arrayContaining(["00899", "OUTRO", "M001"]));
    expect(params[4]).not.toContain("100899");
  });
  it("preenche descrição da SB1 sem ocultar membros sem descrição", async () => {
    const result = await getCostEvolutionItens({ periodoInicio: "202501", periodoFim: "202501", filial: "0101", codAgregado: "00899" });
    expect(result.items.find(item => item.codigo === "OUTRO")?.descricao).toBe("DESCRIÇÃO REAL SB1");
    expect(result.items.find(item => item.codigo === "00899")).toBeDefined();
  });

});
