// ============================================================
// summaryJob.ts — fila de jobs de REDUÇÃO Protheus
// ============================================================
// Reusa a tabela portal_onedrive_sync_jobs (migration 0055) com
// progress.kind = "summary" e progress.product = <TABELA>. O
// worker (oneDriveWorker.ts) consome a fila e executa o job
// validado scripts/protheusSummaryUpload.ts em processo isolado
// (spawn), liberando o portal e o worker imediatamente.
//
// Regras de negócio:
// - Um job summary por vez (mesma fila compartilhada com o sync
//   de referências — o worker é único e sequencial).
// - O produto é validado contra SUMMARY_SCHEMAS antes de criar
//   o job (erro claro para produto não configurado).
// - O progresso do script é publicado no job (progress.log) pelo
//   worker via tail do arquivo de log do spawn.
// ============================================================
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { SUMMARY_SCHEMAS, type ProductCode, isProductConfigured } from "./onedriveSummarySchemas";

export type SummaryJobStatus = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  currentStep: string | null;
  product: string | null;
  log: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export function listConfiguredProducts(): string[] {
  return (Object.keys(SUMMARY_SCHEMAS) as ProductCode[]).filter(product => isProductConfigured(product));
}

export function assertConfiguredProduct(product: string): ProductCode {
  const code = product.toUpperCase() as ProductCode;
  if (!isProductConfigured(code)) {
    throw new Error(`Produto '${product}' sem schema de redução configurado.`);
  }
  return code;
}

export async function createSummaryJob(requestedBy: string, product: ProductCode) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  // Um job de redução por vez: se houver um summary pendente/em andamento,
  // devolve o existente (mesmo padrão do sync de referências).
  const active = await db.execute(sql`
    select id, status
    from public.portal_onedrive_sync_jobs
    where status in ('pending', 'running')
      and progress->>'kind' = 'summary'
    order by created_at desc
    limit 1
  `);
  if (active.rows[0]) {
    return { jobId: String(active.rows[0].id), status: String(active.rows[0].status) as "pending" | "running" };
  }
  const result = await db.execute(sql`
    insert into public.portal_onedrive_sync_jobs (requested_by, status, current_step, progress)
    values (${requestedBy}::uuid, 'pending', 'queued',
            ${JSON.stringify({ kind: "summary", product, step: "queued" })}::jsonb)
    returning id
  `);
  return { jobId: String(result.rows[0].id), status: "pending" as const };
}

export async function getSummaryJob(jobId: string): Promise<SummaryJobStatus | { status: "failed"; error: string }> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const result = await db.execute(sql`
    select id, status, current_step as "currentStep", progress, result, error,
           created_at as "createdAt", finished_at as "finishedAt"
    from public.portal_onedrive_sync_jobs
    where id = ${jobId}::uuid
  `);
  const row = result.rows[0] as {
    id: string; status: SummaryJobStatus["status"]; currentStep: string | null;
    progress: Record<string, unknown>; result: Record<string, unknown> | null;
    error: string | null; createdAt: string; finishedAt: string | null;
  } | undefined;
  if (!row) return { status: "failed" as const, error: "Job não encontrado." };
  const progress = (row.progress ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id),
    status: row.status,
    currentStep: row.currentStep ?? null,
    product: typeof progress.product === "string" ? progress.product : null,
    log: typeof progress.log === "string" ? progress.log : null,
    result: row.result,
    error: row.error ?? null,
    createdAt: String(row.createdAt),
    finishedAt: row.finishedAt ? String(row.finishedAt) : null,
  };
}
