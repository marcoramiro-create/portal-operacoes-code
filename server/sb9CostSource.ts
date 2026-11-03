import type { Pool, QueryResultRow } from "pg";

export type Sb9CostReadSource = {
  batchId: string;
  source: "raw" | "monthly";
  versionId: string | null;
};

type BatchRow = QueryResultRow & { id: string; file_hash: string };
type HeadRow = QueryResultRow & { version_id: string; source_batch_id: string; source_file_hash: string };

function postgresCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return String((error as { code?: unknown }).code ?? "");
}

/** Resolve a última carga aprovada e, quando existente, o snapshot agregado dessa mesma carga. */
export async function resolveSb9CostReadSource(pool: Pick<Pool, "query">): Promise<Sb9CostReadSource | null> {
  const batchResult = await pool.query<BatchRow>(
    `select id::text, file_hash
       from public.operational_import_batches
      where source_kind = 'SB9' and status = 'processed'
      order by imported_at desc, id desc
      limit 1`,
  );
  const batch = batchResult.rows[0];
  if (!batch) return null;

  try {
    const headResult = await pool.query<HeadRow>(
      `select v.id::text as version_id,
              v.source_batch_id::text as source_batch_id,
              v.source_file_hash
         from public.cost_evolution_sb9_head h
         join public.cost_evolution_sb9_versions v on v.id = h.version_id
        where h.singleton = true
          and v.status = 'ready'
          and v.source_batch_id = $1::uuid
          and v.source_file_hash = $2`,
      [batch.id, batch.file_hash],
    );
    const head = headResult.rows[0];
    if (head) return { batchId: batch.id, source: "monthly", versionId: head.version_id };
  } catch (error) {
    // O portal continua funcional antes de instalar a migração exclusiva da Homologação.
    if (postgresCode(error) !== "42P01") throw error;
  }
  return { batchId: batch.id, source: "raw", versionId: null };
}
