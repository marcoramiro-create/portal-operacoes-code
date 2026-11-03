import { describe, expect, it, vi } from "vitest";
import {
  buildIndustryConsumptionFacts,
  industrySourceFingerprint,
  readIndustryConsumption,
  rebuildIndustryConsumption,
} from "./industryConsumptionStore";

const closing = (product: string, period: string, value: number, aggregate = "AGG") => ({
  branch: "0105",
  product,
  aggregate,
  year: period.slice(0, 4),
  month: period.slice(4, 6),
  totalValue: String(value),
});

const entry = (product: string, period: string, quantity: number, itemValue: number) => ({
  branch: "0105",
  product,
  aggregate: "AGG",
  entryDate: `${period.slice(0, 4)}-${period.slice(4, 6)}-15`,
  quantity: String(quantity),
  itemValue: String(itemValue),
});

describe("industryConsumptionStore", () => {
  it("materializa max(0, saldo anterior consecutivo + entradas - saldo atual) e soma duplicados", () => {
    const result = buildIndustryConsumptionFacts(
      [
        closing("P1", "202412", 100),
        closing("P1", "202501", 70),
        closing("P1", "202501", 10),
        closing("P2", "202412", 50),
        closing("P2", "202501", 80),
      ],
      [entry("P1", "202501", 2, 10), entry("P1", "202501", 1, 10), entry("P2", "202501", 2, 20)],
    );

    expect(result.monthly).toEqual([
      { branchCode: "0105", aggregateCode: "AGG", period: "202501", consumptionValue: 60 },
    ]);
    expect(result.stock).toEqual([
      { branchCode: "0105", productCode: "P1", aggregateCode: "AGG", period: "202412", stockValue: 100 },
      { branchCode: "0105", productCode: "P1", aggregateCode: "AGG", period: "202501", stockValue: 80 },
      { branchCode: "0105", productCode: "P2", aggregateCode: "AGG", period: "202412", stockValue: 50 },
      { branchCode: "0105", productCode: "P2", aggregateCode: "AGG", period: "202501", stockValue: 80 },
    ]);
  });

  it("não calcula quando falta o fechamento imediatamente anterior e rejeita montante inválido", () => {
    expect(buildIndustryConsumptionFacts(
      [closing("P1", "202501", 70), closing("P1", "202503", 60)],
      [entry("P1", "202503", 1, 10)],
    ).monthly).toEqual([]);

    expect(() => buildIndustryConsumptionFacts(
      [closing("P1", "202412", Number.NaN), closing("P1", "202501", 1)],
      [entry("P1", "202501", 1, 1)],
    )).toThrow(/finito|inválido/);
  });

  it("calcula fingerprint determinístico pelo manifesto de lotes", () => {
    const a = [
      { id: "b", sourceKind: "ENTRADA_NF" as const, fileHash: "2", rowCount: 2, importedAt: "2026-01-02T00:00:00.000Z" },
      { id: "a", sourceKind: "FECHAMENTO_ESTOQUE" as const, fileHash: "1", rowCount: 1, importedAt: "2026-01-01T00:00:00.000Z" },
    ];
    const b = [...a].reverse();
    expect(industrySourceFingerprint(a)).toBe(industrySourceFingerprint(b));
  });

  it("falha com BASE_INDUSTRIAL_NAO_PREPARADA sem consultar fatos brutos", async () => {
    const queries: string[] = [];
    const query = vi.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.startsWith("BEGIN")) return { rows: [] };
      if (sql.includes("from public.industry_consumption_head")) return { rows: [] };
      if (sql === "ROLLBACK") return { rows: [] };
      throw new Error(`query inesperada: ${sql}`);
    });
    const release = vi.fn();
    const pool = { connect: vi.fn().mockResolvedValue({ query, release }) };

    await expect(readIndustryConsumption(pool as never, ["202501"], "0105")).rejects.toThrow("BASE_INDUSTRIAL_NAO_PREPARADA");
    expect(queries.some(sql => sql.includes("operational_source_rows"))).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("detecta fonte alterada após publicação e não devolve dados potencialmente stale", async () => {
    const publishedBatches = [
      { id: "a", sourceKind: "FECHAMENTO_ESTOQUE", fileHash: "old-stock", rowCount: 2, importedAt: new Date("2026-01-01T00:00:00.000Z") },
      { id: "b", sourceKind: "ENTRADA_NF", fileHash: "old-entry", rowCount: 2, importedAt: new Date("2026-01-01T00:00:00.000Z") },
    ];
    const changedBatches = [
      { ...publishedBatches[0] },
      { ...publishedBatches[1], fileHash: "new-entry" },
    ];
    const fingerprint = industrySourceFingerprint(publishedBatches.map(batch => ({ ...batch, importedAt: batch.importedAt.toISOString() })));
    let manifestRead = 0;
    const queries: string[] = [];
    const query = vi.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.startsWith("BEGIN")) return { rows: [] };
      if (sql.includes("from public.industry_consumption_head")) {
        return { rows: [{ versionId: "v1", status: "ready", sourceFingerprint: fingerprint, publishedAt: new Date("2026-01-03T00:00:00.000Z") }] };
      }
      if (sql.includes("from public.industry_consumption_monthly")) {
        return { rows: [{ branchCode: "0105", aggregateCode: "AGG", period: "202501", consumptionValue: "5" }] };
      }
      if (sql.includes("from public.industry_stock_monthly")) return { rows: [] };
      if (sql.includes("from public.operational_import_batches")) {
        manifestRead += 1;
        const batches = manifestRead === 1 ? changedBatches : changedBatches;
        return { rows: batches.map(batch => ({ ...batch, importedAt: batch.importedAt.toISOString() })) };
      }
      if (sql === "ROLLBACK") return { rows: [] };
      throw new Error(`query inesperada: ${sql}`);
    });
    const release = vi.fn();
    const pool = { connect: vi.fn().mockResolvedValue({ query, release }) };

    await expect(readIndustryConsumption(pool as never, ["202501"], "0105")).rejects.toThrow("BASE_INDUSTRIAL_DESATUALIZADA");
    expect(queries.some(sql => sql.includes("operational_source_rows"))).toBe(false);
    expect(queries).toContain("ROLLBACK");
  });

  it("em falha de rebuild não publica head nem usa fallback raw", async () => {
    const queries: string[] = [];
    let closingFetch = 0;
    let entryFetch = 0;
    const query = vi.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.startsWith("FETCH") && sql.includes("industry_consumption_closing_cursor")) {
        closingFetch += 1;
        return { rows: closingFetch === 1 ? [closing("P1", "202501", 10)] : [] };
      }
      if (sql.startsWith("FETCH") && sql.includes("industry_consumption_entry_cursor")) {
        entryFetch += 1;
        return { rows: entryFetch === 1 ? [entry("P1", "202501", 1, 1)] : [] };
      }
      if (sql.includes("from public.operational_import_batches")) {
        return {
          rows: [
            { id: "a", sourceKind: "FECHAMENTO_ESTOQUE", fileHash: "stock", rowCount: 1, importedAt: new Date("2026-01-01T00:00:00.000Z") },
            { id: "b", sourceKind: "ENTRADA_NF", fileHash: "entry", rowCount: 1, importedAt: new Date("2026-01-01T00:00:00.000Z") },
          ],
        };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const pool = { connect: vi.fn().mockResolvedValue({ query, release }) };

    await expect(rebuildIndustryConsumption(pool as never)).rejects.toThrow("consumo calculável");
    expect(queries).toContain("ROLLBACK");
    expect(queries.some(sql => sql.includes("industry_consumption_head"))).toBe(false);
    expect(queries.some(sql => sql.includes("operational_source_rows") && sql.toLowerCase().includes("select"))).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
