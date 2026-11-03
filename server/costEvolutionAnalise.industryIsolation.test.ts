import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const mocks = vi.hoisted(() => {
  type SqlCall = { source: string; sql: string; params?: unknown[] };
  type TraceCall = SqlCall | { source: "costSourceCursor"; sql: string; params: unknown[] };

  const trace: TraceCall[] = [];
  const mode = {
    sb9: "valid" as "valid" | "failure",
    curve: "current" as "current" | "historical",
    salesSnapshot: false,
  };
  const industryAnalise = vi.fn();
  const industryItens = vi.fn();

  const cloneBaseResult = () => structuredClone({
    periodos: [{ period: "202501" }, { period: "202502" }],
    items: [{
      codigo: "00004",
      descricao: "Produto agregado de teste",
      filial: "0101",
      cod_agregado: "AGG-1",
      meses: [
        { period: "202501", custo_medio: 10 },
        { period: "202502", custo_medio: 12 },
      ],
    }],
  });

  const businessPool = {
    query: vi.fn(async (sql: unknown, params?: unknown[]) => {
      const text = String(sql);
      trace.push({ source: "businessPool", sql: text, ...(params === undefined ? {} : { params: structuredClone(params) }) });
      if (text.includes("get_cost_evolution")) return { rows: [{ result: cloneBaseResult() }] };
      if (text.includes('select id::text as id')) return { rows: [{ id: "63" }] };
      if (text.includes("purchase_sales_monthly_head") && mode.salesSnapshot) {
        return { rows: [{ versionId: "sales-version-1", status: "ready", sourceFingerprint: "b1a92eeb5d0cd48f6f1f3d612bc3a31e8b04f0f9d3dee263c083c6cc1dd2005b", factRows: 2, publishedAt: "2026-11-03T00:00:00Z" }] };
      }
      if (text.includes("purchase_sales_monthly_head")) return { rows: [] };
      if (text.includes("purchase_sales_source_revision")) return { rows: [] };
      if (text.includes("purchase_sales_monthly_facts")) {
        return { rows: [
          { branchCode: "0101", code: "AGG-1", period: "202501", quantity: "2" },
          { branchCode: "0101", code: "AGG-1", period: "202502", quantity: "3" },
        ] };
      }
      if (text.includes("with requested as")) {
        return { rows: [{ code: "AGG-1", branchCode: "0101", curve: "D" }] };
      }
      if (text.includes('"salesMonths"')) {
        return {
          rows: [{
            branch: "0101",
            code: "AGG-1",
            codeOriginal: null,
            salesMonths: { "202501": 2, "202502": 3 },
            importedAt: "2025-03-01T00:00:00.000Z",
            importId: 1,
            rowId: 1,
          }],
        };
      }
      if (text.includes('"stockValue"')) {
        return { rows: [{ branch: "0101", code: "AGG-1", codeOriginal: null, stock: "7", stockValue: "70" }] };
      }
      if (text.includes('inventoryAnalytics') && text.includes("curve")) {
        return { rows: mode.curve === "current"
          ? [{ code: "AGG-1", codeOriginal: null, branchCode: "0101", curve: "A" }]
          : [] };
      }
      throw new Error(`SQL de negócio não previsto no fixture: ${text}`);
    }),
  };

  const costSourcePool = {
    query: vi.fn(async (sql: unknown, params?: unknown[]) => {
      const text = String(sql);
      trace.push({ source: "costSourcePool", sql: text, ...(params === undefined ? {} : { params: structuredClone(params) }) });
      if (text.includes("source_kind = 'SB9'") && text.includes("file_hash")) {
        return { rows: [{ id: "sb9-batch-1", file_hash: "hash-1" }] };
      }
      if (text.includes("cost_evolution_sb9_head")) return { rows: [] };
      if (text.includes("operational_import_batches") && text.includes("aggregate_product_code") && text.includes("source_row_number")) {
        return {
          rows: [{
            product: "00004",
            aggregate: "AGG-1",
            importedAt: "2025-03-01T00:00:00.000Z",
            sourceRow: 1,
          }],
        };
      }
      if (text.includes("sbz_product_curves")) return { rows: [] };
      throw new Error(`SQL da fonte de custos não previsto no fixture: ${text}`);
    }),
  };

  const authPool = { query: vi.fn() };
  const industryPool = { query: vi.fn() };

  const sourceCursor = vi.fn(async function* (_pool: unknown, sql: string, params: unknown[] = []) {
    trace.push({ source: "costSourceCursor", sql: String(sql), params: structuredClone(params) });
    if (mode.sb9 === "failure") throw new Error("SB9 indisponível no fixture");
    if (String(sql).includes("unit_value")) {
      yield { branch: "0101", product: "00004", period: "202501", cost: "11" };
      yield { branch: "0101", product: "00004", period: "202502", cost: "13" };
      return;
    }
    throw new Error(`cursor da fonte não previsto no fixture: ${sql}`);
  });

  const garantirIndices = vi.fn(async (_pool: unknown, periods: string[]) => ({
    IPCA: "ok" as const,
    DOLAR: "ok" as const,
    detalhes: {},
    periods,
  }));
  const getIndices = vi.fn(async () => ({
    IPCA: new Map([
      ["202501", { valor: 1, valorFechamento: null }],
      ["202502", { valor: 2, valorFechamento: null }],
    ]),
    DOLAR: new Map([
      ["202501", { valor: 5, valorFechamento: 5 }],
      ["202502", { valor: 5.25, valorFechamento: 5.25 }],
    ]),
  }));

  return {
    trace,
    mode,
    businessPool,
    costSourcePool,
    authPool,
    industryPool,
    sourceCursor,
    garantirIndices,
    getIndices,
    industryAnalise,
    industryItens,
    resetTrace() {
      trace.splice(0, trace.length);
    },
    resetMocks() {
      mode.sb9 = "valid";
      mode.curve = "current";
      mode.salesSnapshot = false;
      trace.splice(0, trace.length);
      businessPool.query.mockClear();
      costSourcePool.query.mockClear();
      authPool.query.mockClear();
      industryPool.query.mockClear();
      sourceCursor.mockClear();
      garantirIndices.mockClear();
      getIndices.mockClear();
      industryAnalise.mockReset();
      industryItens.mockReset();
    },
  };
});

vi.mock("./supabasePortal", () => ({
  getBusinessPool: vi.fn(() => mocks.businessPool),
  getSupabasePool: vi.fn(() => mocks.authPool),
}));
vi.mock("./costSourcePool", () => ({
  getCostSourcePool: vi.fn(() => mocks.costSourcePool),
}));
vi.mock("./industryCostSourcePool", () => ({
  getCostSourcePool: vi.fn(() => mocks.industryPool),
}));
vi.mock("./costSourceCursor", () => ({
  streamCostSourceRows: mocks.sourceCursor,
}));
vi.mock("./economicIndices", () => ({
  garantirIndicesEconomicos: mocks.garantirIndices,
  getIndicesEconomicos: mocks.getIndices,
}));
vi.mock("./industryCostEvolutionAnalise", () => ({
  getCostEvolutionAnalise: mocks.industryAnalise,
  getCostEvolutionItens: mocks.industryItens,
}));

import * as candidate from "./costEvolutionDispatch";

type EvolutionModule = typeof import("./costEvolutionAnalise");
type SqlTrace = Array<{ source: string; sql: string; params?: unknown[] }>;

const PROJECT_SERVER = resolve(process.cwd(), "server");
const BASELINE_TAR = "/home/ubuntu/portal-cost-unblock-homolog.tar.gz";
let baseline: EvolutionModule;
let baselineDirectory: string | undefined;

function projectModuleUrl(file: string): string {
  return pathToFileURL(join(PROJECT_SERVER, file)).href;
}

function loadIndependentBaselineSource(): string {
  const source = execFileSync("tar", ["-xOzf", BASELINE_TAR, "files/server/costEvolutionAnalise.ts"], { encoding: "utf8" });
  const imports: Record<string, string> = {
    supabasePortal: projectModuleUrl("supabasePortal.ts"),
    costSourcePool: projectModuleUrl("costSourcePool.ts"),
    costEvolutionBenchmarkAdapter: projectModuleUrl("costEvolutionBenchmarkAdapter.ts"),
    costSourceCursor: projectModuleUrl("costSourceCursor.ts"),
    costWeightedMonthly: projectModuleUrl("costWeightedMonthly.ts"),
    costSalesHistory: projectModuleUrl("costSalesHistory.ts"),
    costCurveLookup: projectModuleUrl("costCurveLookup.ts"),
    economicIndices: projectModuleUrl("economicIndices.ts"),
  };
  let rewritten = source;
  for (const [name, url] of Object.entries(imports)) {
    rewritten = rewritten.replaceAll(`from "./${name}"`, `from "${url}"`);
  }
  return rewritten;
}

async function runIndependentBaseline(): Promise<EvolutionModule> {
  baselineDirectory = mkdtempSync(join(tmpdir(), "cost-evolution-baseline-"));
  const baselinePath = join(baselineDirectory, "costEvolutionAnalise.ts");
  writeFileSync(baselinePath, loadIndependentBaselineSource(), "utf8");
  return (await import(`${pathToFileURL(baselinePath).href}?baseline=${Date.now()}`)) as EvolutionModule;
}

function traceSnapshot(): SqlTrace {
  return structuredClone(mocks.trace) as SqlTrace;
}

async function compareAutoRuntime(
  method: "getCostEvolutionAnalise" | "getCostEvolutionItens",
  sb9: "valid" | "failure",
  params: Record<string, unknown> = {},
) {
  mocks.resetMocks();
  mocks.mode.sb9 = sb9;
  const input = {
    periodoInicio: "202501",
    periodoFim: "202502",
    filial: "0101",
    ...params,
  };
  const baselineResult = await baseline[method](input as never);
  const baselineTrace = traceSnapshot();
  mocks.resetTrace();
  const candidateResult = await candidate[method](input as never);
  const candidateTrace = traceSnapshot();
  expect(candidateResult).toEqual(baselineResult);

  // O novo resolver/builder altera as consultas de apoio, mas não o contrato
  // nem os demais cálculos financeiros comparados com o baseline independente.
  const isNewReadPath = (call: SqlTrace[number]) =>
    call.source === "costSourceCursor" ||
    (call.source === "costSourcePool" && (call.sql.includes("file_hash") || call.sql.includes("cost_evolution_sb9_head") || call.sql.includes("source_row_number"))) ||
    (call.source === "businessPool" && call.sql.includes("purchase_sales_monthly_head"));
  const comparable = (calls: SqlTrace) => calls.filter(call => !isNewReadPath(call)).map(call => ({ ...call, sql: call.sql
    .replace(/,\s*nullif\(trim\(r\.normalized_payload->>'description'\), ''\) as description/g, "")
    .replace(/\s+/g, " ").trim() }));
  expect(comparable(candidateTrace)).toEqual(comparable(baselineTrace));
  expect(candidateTrace.some(call => call.source === "costSourcePool" && call.sql.includes("file_hash"))).toBe(true);
  expect(candidateTrace.some(call => call.source === "costSourceCursor" && call.params?.[0] === "sb9-batch-1" && !call.sql.includes("trim(r.branch_code)") && !call.sql.includes("trim(r.product_code)"))).toBe(true);
  return { baselineResult, baselineTrace };
}

beforeAll(async () => {
  baseline = await runIndependentBaseline();
});

afterAll(() => {
  if (baselineDirectory) rmSync(baselineDirectory, { recursive: true, force: true });
});

beforeEach(() => {
  mocks.resetMocks();
  mocks.industryAnalise.mockResolvedValue({ delegated: "analise" });
  mocks.industryItens.mockResolvedValue({ delegated: "itens" });
});

describe("isolamento industrial e paridade do caminho Autopeças", () => {
  it("compara análise e SQL com SB9 válida contra o baseline independente", async () => {
    const { baselineResult, baselineTrace } = await compareAutoRuntime("getCostEvolutionAnalise", "valid");

    expect(baselineResult).toMatchObject({
      periodoEfetivoInicio: "202501",
      periodoEfetivoFim: "202502",
      cards: { custoTotal: 61, comCusto: 1, alta: 1, reducao: 0 },
    });
    expect(baselineResult.benchmarkReport).toMatchObject({ dolarVariationPercent: 5 });
    expect(Number(baselineResult.benchmarkReport.ipcaPercent)).toBeCloseTo(3.02, 10);
    expect(baselineTrace.some(call => call.source === "costSourceCursor" && call.sql.includes("unit_value"))).toBe(true);
    expect(baselineTrace.some(call => call.source === "businessPool" && call.sql.includes("salesMonths"))).toBe(true);
  });

  it("usa a última curva aprovada como fallback e reinclui o custo antes excluído por falta de curva", async () => {
    const params = { periodoInicio: "202501", periodoFim: "202502", filial: "0101" };
    mocks.resetMocks();
    mocks.mode.curve = "historical";
    const baselineResult = await baseline.getCostEvolutionAnalise(params as never);

    mocks.resetMocks();
    mocks.mode.curve = "historical";
    const historicalResult = await candidate.getCostEvolutionAnalise(params);

    expect(baselineResult.cards.custoTotal).toBe(0);
    expect(historicalResult.cards.custoTotal).toBe(61);
    expect(historicalResult.benchmarkReport.byCurve).toMatchObject({ D: { itemCount: 1 } });
    const historyQuery = mocks.businessPool.query.mock.calls.find(([sql]) => String(sql).includes("with requested as"));
    expect(historyQuery?.[1]).toEqual([["0101", "0101"], ["AGG-1", "00004"]]);
  });

  it("compara análise, fallback e SQL com falha da SB9 contra o baseline independente", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const { baselineResult, baselineTrace } = await compareAutoRuntime("getCostEvolutionAnalise", "failure");

      expect(baselineResult).toMatchObject({
        periodoEfetivoInicio: "202501",
        periodoEfetivoFim: "202502",
        cards: { custoTotal: 56, comCusto: 1, alta: 1, reducao: 0 },
      });
      expect(baselineTrace.filter(call => call.source === "costSourceCursor")).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("[Custos] SB9 não incorporada à evolução"), expect.any(String));
    } finally {
      warn.mockRestore();
    }
  });

  it("mantém a resposta de itens e chamadas SQL do caminho Autopeças em paridade", async () => {
    const { baselineResult } = await compareAutoRuntime("getCostEvolutionItens", "valid", {
      curvaFiltro: "A",
      ordenacao: "codigo",
      direcao: "asc",
      pagina: 1,
      itensPorPagina: 10,
    });

    expect(baselineResult).toMatchObject({
      total: 1,
      pagina: 1,
      itensPorPagina: 10,
      items: [{ codigo: "00004", filial: "0101", curve: "A", costStatus: "COM_BASE" }],
    });
    expect(baselineResult.items[0].meses).toEqual([
      expect.objectContaining({ period: "202501", custo_medio: 11, quantidade_vendida: 2 }),
      expect.objectContaining({ period: "202502", custo_medio: 13, quantidade_vendida: 3 }),
    ]);
  });

  it("usa facts de vendas mensais indexados sem consultar inventoryAnalytics.salesMonths", async () => {
    mocks.mode.salesSnapshot = true;
    const result = await candidate.getCostEvolutionItens({
      periodoInicio: "202501", periodoFim: "202502", filial: "0101",
      curvaFiltro: "A", ordenacao: "codigo", direcao: "asc", pagina: 1, itensPorPagina: 10,
    } as never);
    expect(result.items[0].meses).toEqual([
      expect.objectContaining({ period: "202501", quantidade_vendida: 2 }),
      expect.objectContaining({ period: "202502", quantidade_vendida: 3 }),
    ]);
    expect(mocks.businessPool.query.mock.calls.some(([sql]) => String(sql).includes("purchase_sales_monthly_facts"))).toBe(true);
    expect(mocks.businessPool.query.mock.calls.some(([sql]) => String(sql).includes('"salesMonths"'))).toBe(false);
  });

  it("encaminha a análise industrial inteira para o módulo industrial", async () => {
    const params = { segment: "industry", periodoInicio: "202501", periodoFim: "202502", filial: "0105" };
    await expect(candidate.getCostEvolutionAnalise(params)).resolves.toEqual({ delegated: "analise" });
    expect(mocks.industryAnalise).toHaveBeenCalledTimes(1);
    expect(mocks.industryAnalise).toHaveBeenCalledWith(params);
    expect(mocks.costSourcePool.query).not.toHaveBeenCalled();
    expect(mocks.industryPool.query).not.toHaveBeenCalled();
  });

  it("encaminha os itens industriais inteiros para o módulo industrial", async () => {
    const params = { segment: "industry", periodoInicio: "202501", periodoFim: "202502", filial: "0105" };
    await expect(candidate.getCostEvolutionItens(params)).resolves.toEqual({ delegated: "itens" });
    expect(mocks.industryItens).toHaveBeenCalledTimes(1);
    expect(mocks.industryItens).toHaveBeenCalledWith(params);
    expect(mocks.costSourcePool.query).not.toHaveBeenCalled();
    expect(mocks.industryPool.query).not.toHaveBeenCalled();
  });
});
