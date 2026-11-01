import { describe, expect, it, vi } from 'vitest';
import { streamCostSourceRows } from './costSourceCursor';

describe('cursor das fontes de custos', () => {
  it('lê em lotes e encerra transação/conexão', async () => {
    let fetches = 0;
    const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith('FETCH') ? (++fetches === 1 ? [{ value: 10 }, { value: 20 }] : []) : [] }));
    const release = vi.fn();
    const pool = { connect: vi.fn().mockResolvedValue({ query, release }) };
    const rows = [];
    for await (const row of streamCostSourceRows<{ value: number }>(pool as unknown as Parameters<typeof streamCostSourceRows>[0], 'SELECT $1::int as value', [10])) rows.push(row.value);
    expect(rows).toEqual([10,20]);
    expect(query).toHaveBeenCalledWith('DECLARE portal_cost_source_cursor NO SCROLL CURSOR FOR SELECT $1::int as value', [10]);
    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(query).not.toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('faz rollback e libera conexão se FETCH falhar', async () => {
    const query = vi.fn(async (sql: string) => { if(sql.startsWith('FETCH')) throw new Error('fetch failed'); return { rows: [] }; });
    const release = vi.fn();
    const pool = { connect: vi.fn().mockResolvedValue({ query, release }) };
    await expect((async () => { for await (const row of streamCostSourceRows(pool as unknown as Parameters<typeof streamCostSourceRows>[0], 'SELECT 1')) void row; })()).rejects.toThrow('fetch failed');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('libera conexão se o consumidor interromper a leitura', async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith('FETCH') ? [{ value: 1 }] : [] }));
    const release = vi.fn();
    const pool = { connect: vi.fn().mockResolvedValue({ query, release }) };
    for await (const row of streamCostSourceRows(pool as unknown as Parameters<typeof streamCostSourceRows>[0], 'SELECT 1')) { void row; break; }
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
