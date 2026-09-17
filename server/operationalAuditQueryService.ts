import { getSupabasePool } from "./supabasePortal";
import { buildOperationalAuditReport, type OperationalAuditInput, type OperationalAuditReport } from "./operationalAuditService";

type SourceKind = "SB1" | "SBZ" | "SB5" | "SA2" | "PEDIDO_COMPRA" | "NF_LEGAL" | "FECHAMENTO_ESTOQUE";
const sources: SourceKind[] = ["SB1", "SBZ", "SB5", "SA2", "PEDIDO_COMPRA", "NF_LEGAL", "FECHAMENTO_ESTOQUE"];

/** Consulta somente leitura: cada fonte é carregada separadamente para evitar joins cartesianos. */
export async function loadOperationalAuditInput(): Promise<OperationalAuditInput> {
  const db = getSupabasePool();
  const latest = await db.query<{ source_kind: SourceKind; id: string }>(
    `select distinct on (source_kind) source_kind, id from public.operational_import_batches where status='processed' and source_kind = any($1::text[]) order by source_kind, imported_at desc`,
    [sources],
  );
  const batchBySource = new Map(latest.rows.map(row => [row.source_kind, row.id]));
  const loaded = new Map<SourceKind, unknown[]>();
  for (const source of sources) {
    const batchId = batchBySource.get(source);
    if (!batchId) { loaded.set(source, []); continue; }
    const rows = await db.query<{ normalized_payload: unknown }>(
      `select normalized_payload from public.operational_source_rows where batch_id=$1 order by source_row_number`,
      [batchId],
    );
    loaded.set(source, rows.rows.map(row => row.normalized_payload));
  }
  return {
    sb1: (loaded.get("SB1") ?? []) as OperationalAuditInput["sb1"],
    sbz: (loaded.get("SBZ") ?? []) as OperationalAuditInput["sbz"],
    sb5: (loaded.get("SB5") ?? []) as OperationalAuditInput["sb5"],
    sa2: (loaded.get("SA2") ?? []) as OperationalAuditInput["sa2"],
    orders: (loaded.get("PEDIDO_COMPRA") ?? []) as OperationalAuditInput["orders"],
    invoices: (loaded.get("NF_LEGAL") ?? []) as OperationalAuditInput["invoices"],
    stock: (loaded.get("FECHAMENTO_ESTOQUE") ?? []) as OperationalAuditInput["stock"],
  };
}

export async function queryOperationalAudit(): Promise<OperationalAuditReport> {
  return buildOperationalAuditReport(await loadOperationalAuditInput());
}
