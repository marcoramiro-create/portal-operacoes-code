import { describe, expect, it } from "vitest";
import { buildCostSalesHistoryIndex, getCostSalesHistoryQuantity } from "./costSalesHistory";
import { buildPurchaseSalesFactSnapshot, materializePurchaseSalesFacts, type PurchaseSalesSourceRow } from "./purchaseSalesFacts";

const row = (
  sourceImportId: number,
  sourceRowId: number,
  branch: string,
  code: string,
  codeOriginal: string,
  salesMonths: Record<string, unknown>,
  sourceImportedAt = "2026-01-01T00:00:00Z",
): PurchaseSalesSourceRow => ({ sourceImportId, sourceRowId, sourceImportedAt, branch, code, codeOriginal, salesMonths });

describe("purchaseSalesFacts", () => {
  it("produces the same latest monthly quantities as the existing in-memory lookup", async () => {
    const input = [
      row(51, 501, "101", "4-MGT", "00004-MGT", { "01/2025": 51, "12/2025": 12 }),
      row(63, 630, "0101", "4-MGT", "00004-MGT", { "out/2025": 63, "12/2025": 63 }),
      row(64, 640, "0101", "00004-MGT", "00004-MGT", { "2025-10": 64, "nov/2025": 0 }),
    ];
    const oldIndex = buildCostSalesHistoryIndex(input.map(source => ({
      branch: String(source.branch),
      code: String(source.code),
      codeOriginal: String(source.codeOriginal),
      salesMonths: source.salesMonths as Record<string, unknown>,
      importedAt: source.sourceImportedAt,
      importId: source.sourceImportId,
      rowId: source.sourceRowId,
    })));
    const snapshot = await buildPurchaseSalesFactSnapshot(input);

    for (const [key, quantity] of oldIndex) {
      const [branchCode, code, period] = key.split("|");
      expect(snapshot.get(key)?.quantity).toBe(quantity);
      expect(getCostSalesHistoryQuantity(snapshotToIndex(snapshot), branchCode, code, period)).toBe(quantity);
    }
    expect(snapshot.size).toBe(oldIndex.size);
  });

  it("preserves zero as a real fact, the original code alias, and letter suffixes", async () => {
    const facts = [];
    for await (const fact of materializePurchaseSalesFacts([
      row(1, 1, "0101", "00004-MGT", "00004-MGT", { "Nov/2025": 0 }),
    ])) facts.push(fact);

    expect(facts.map(fact => [fact.branchCode, fact.code, fact.period, fact.quantity])).toEqual([
      ["0101", "00004-MGT", "202511", 0],
      ["0101", "4-MGT", "202511", 0],
    ]);
  });

  it("rejects conflicting duplicates inside one approved import", async () => {
    await expect(async () => {
      for await (const _fact of materializePurchaseSalesFacts([
        row(7, 70, "0101", "4-MGT", "00004-MGT", { "2025-01": 10 }),
        row(7, 71, "0101", "00004-MGT", "00004-MGT", { "01/2025": 11 }),
      ])) { /* consume stream */ }
    }).rejects.toThrow(/Duplicidade conflitante na mesma carga/);
  });

  it("chooses by importedAt then importId when aliases appear in multiple loads", async () => {
    const snapshot = await buildPurchaseSalesFactSnapshot([
      row(4, 40, "0101", "4-MGT", "00004-MGT", { "2025-01": 40 }, "2026-02-01T00:00:00Z"),
      row(9, 90, "0101", "00004-MGT", "00004-MGT", { "2025-01": 90 }, "2026-02-01T00:00:00Z"),
      row(10, 100, "0101", "00004-MGT", "00004-MGT", { "2025-01": 10 }, "2026-01-01T00:00:00Z"),
    ]);
    expect(snapshot.get("0101|00004-MGT|202501")?.quantity).toBe(90);
    expect(snapshot.get("0101|00004-MGT|202501")?.sourceImportId).toBe(9);
  });

  it("requires source rows ordered by importId for one-load duplicate validation", async () => {
    await expect(async () => {
      for await (const _fact of materializePurchaseSalesFacts([
        row(2, 20, "0101", "1", "1", { "2025-01": 1 }),
        row(1, 10, "0101", "1", "1", { "2025-01": 1 }),
      ])) { /* consume stream */ }
    }).rejects.toThrow(/ordenadas por importId/);
  });
});

function snapshotToIndex(snapshot: Map<string, { quantity: number }>): Map<string, number> {
  return new Map([...snapshot].map(([key, fact]) => [key, fact.quantity]));
}
