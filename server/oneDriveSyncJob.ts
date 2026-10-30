import { sql } from "drizzle-orm";
import { getDb } from "./db";

export type OneDriveSyncResult = {
  results: Array<{ kind: string; fileName: string; status: string; count: number; updatedAt: string }>;
  reenriquecidos: number;
  warning: string | null;
  classificationIssues: unknown[];
};
export type OneDriveSyncStatus = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  currentStep: string | null;
  progress: Record<string, unknown>;
  result: OneDriveSyncResult | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export async function createOneDriveSyncJob(requestedBy: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const active = await db.execute(sql`
    select id, status
    from public.portal_onedrive_sync_jobs
    where status in ('pending', 'running')
    order by created_at desc
    limit 1
  `);
  if (active.rows[0]) return { jobId: String(active.rows[0].id), status: String(active.rows[0].status) as "pending" | "running" };
  const result = await db.execute(sql`
    insert into public.portal_onedrive_sync_jobs (requested_by, status, current_step, progress)
    values (${requestedBy}::uuid, 'pending', 'queued', '{"step":"queued"}'::jsonb)
    returning id
  `);
  return { jobId: String(result.rows[0].id), status: "pending" as const };
}

export async function getOneDriveSyncJob(jobId: string): Promise<OneDriveSyncStatus | { status: "failed"; error: string }> {
  return getDb().then(async db => {
    if (!db) throw new Error("Banco indisponível.");
    const result = await db.execute(sql`
      select id, status, current_step as "currentStep", progress, result, error,
             created_at as "createdAt", started_at as "startedAt", finished_at as "finishedAt"
      from public.portal_onedrive_sync_jobs
      where id = ${jobId}::uuid
    `);
    const row = result.rows[0] as Partial<OneDriveSyncStatus> | undefined;
    if (!row) return { status: "failed" as const, error: "Atualização não encontrada. Inicie uma nova atualização." };
    return {
      id: String(row.id),
      status: row.status ?? "failed",
      currentStep: row.currentStep ?? null,
      progress: (row.progress as Record<string, unknown> | undefined) ?? {},
      result: (row.result as OneDriveSyncResult | null | undefined) ?? null,
      error: row.error ?? null,
      createdAt: String(row.createdAt),
      startedAt: row.startedAt ? String(row.startedAt) : null,
      finishedAt: row.finishedAt ? String(row.finishedAt) : null,
    };
  });
}
