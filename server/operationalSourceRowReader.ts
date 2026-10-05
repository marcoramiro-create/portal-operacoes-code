import { getSupabasePool } from "./supabasePortal";

export const OPERATIONAL_SOURCE_KINDS = ["SB1", "SBZ", "SB5", "SA2", "PEDIDO_COMPRA", "NF_LEGAL", "FECHAMENTO_ESTOQUE"] as const;
export type OperationalSourceKind = (typeof OPERATIONAL_SOURCE_KINDS)[number];
export type SourceRowPage = { batchId: string; rows: { sourceRowNumber: number; payload: unknown }[]; nextCursor: number | null };
export type QueryFn = <T = unknown>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
export const DEFAULT_SOURCE_ROW_BATCH_SIZE = 1000;
export const MAX_SOURCE_ROW_BATCH_SIZE = 5000;
export function resolveSourceRowBatchSize(raw: unknown): number { const n = typeof raw === "number" ? Math.trunc(raw) : Number.parseInt(String(raw ?? ""), 10); return !Number.isFinite(n) || n <= 0 ? DEFAULT_SOURCE_ROW_BATCH_SIZE : Math.min(n, MAX_SOURCE_ROW_BATCH_SIZE); }
export type OperationalSourceRowReader = { listLatestProcessedBatchIds(): Promise<Map<OperationalSourceKind, string>>; readSourceBatchPages(batchId: string): AsyncGenerator<SourceRowPage, void, void> };
export function createOperationalSourceRowReader(options?: { query?: QueryFn; batchSize?: number }): OperationalSourceRowReader {
  const query: QueryFn = options?.query ?? ((sql, params) => getSupabasePool().query(sql, params as never[]) as Promise<{ rows: never[] }>);
  const batchSize = resolveSourceRowBatchSize(options?.batchSize ?? process.env.AUDIT_SYNC_BATCH_SIZE);
  return {
    async listLatestProcessedBatchIds() { const r = await query<{ source_kind: OperationalSourceKind; id: string }>(`select distinct on (source_kind) source_kind, id from public.operational_import_batches where status='processed' and source_kind = any($1::text[]) order by source_kind, imported_at desc`, [[...OPERATIONAL_SOURCE_KINDS]]); return new Map(r.rows.map(x => [x.source_kind, x.id])); },
    async *readSourceBatchPages(batchId) { let cursor = -1; for (;;) { const r = await query<{ sourceRowNumber: number; payload: unknown }>(`select source_row_number as "sourceRowNumber", normalized_payload as payload from public.operational_source_rows where batch_id=$1 and source_row_number>$2 order by source_row_number limit $3`, [batchId, cursor, batchSize]); if (!r.rows.length) return; cursor = r.rows[r.rows.length - 1].sourceRowNumber; yield { batchId, rows: r.rows, nextCursor: cursor }; if (r.rows.length < batchSize) return; } },
  };
}
