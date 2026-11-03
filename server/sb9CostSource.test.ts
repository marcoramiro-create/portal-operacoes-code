import { describe, expect, it, vi } from "vitest";
import { resolveSb9CostReadSource } from "./sb9CostSource";

describe("resolveSb9CostReadSource", () => {
  it("retorna null quando ainda não existe lote SB9 processado", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await expect(resolveSb9CostReadSource(pool as never)).resolves.toBeNull();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("usa snapshot somente quando corresponde ao lote e ao hash atuais", async () => {
    const pool = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "batch-1", file_hash: "hash-1" }] })
      .mockResolvedValueOnce({ rows: [{ version_id: "version-1" }] }) };
    await expect(resolveSb9CostReadSource(pool as never)).resolves.toEqual({
      batchId: "batch-1", source: "monthly", versionId: "version-1",
    });
  });

  it("usa fonte bruta até a migração de leitura mensal ser instalada", async () => {
    const missingTable = Object.assign(new Error("relation missing"), { code: "42P01" });
    const pool = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "batch-2", file_hash: "hash-2" }] })
      .mockRejectedValueOnce(missingTable) };
    await expect(resolveSb9CostReadSource(pool as never)).resolves.toEqual({
      batchId: "batch-2", source: "raw", versionId: null,
    });
  });

  it("não usa versão publicada para outro lote nem outro hash", async () => {
    const pool = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "batch-current", file_hash: "hash-current" }] })
      .mockResolvedValueOnce({ rows: [] }) };
    await expect(resolveSb9CostReadSource(pool as never)).resolves.toEqual({
      batchId: "batch-current", source: "raw", versionId: null,
    });
  });
});
