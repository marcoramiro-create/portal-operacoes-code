import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { syncOneDriveReferences } from "./oneDriveReferenceSync";
import { syncOneDriveSb9 } from "./oneDriveCostSync";
import { createOneDriveWorkerRequest } from "./oneDriveOAuth";

type JobRow = { id: string; requested_by: string };

async function claimJob() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  await db.execute(sql`
    update public.portal_onedrive_sync_jobs
    set status = 'pending', current_step = 'queued', heartbeat_at = now()
    where status = 'running'
      and heartbeat_at < now() - interval '30 minutes'
  `);
  const result = await db.execute(sql`
    with candidate as (
      select id
      from public.portal_onedrive_sync_jobs
      where status = 'pending'
      order by created_at
      for update skip locked
      limit 1
    )
    update public.portal_onedrive_sync_jobs job
    set status = 'running',
        current_step = 'references',
        started_at = now(),
        heartbeat_at = now(),
        error = null
    from candidate
    where job.id = candidate.id
    returning job.id, job.requested_by
  `);
  return (result.rows[0] as JobRow | undefined) ?? null;
}

async function updateJob(jobId: string, values: { currentStep?: string; progress?: unknown; result?: unknown; error?: string; status?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  await db.execute(sql`
    update public.portal_onedrive_sync_jobs
    set current_step = coalesce(${values.currentStep ?? null}, current_step),
        progress = coalesce(${values.progress === undefined ? null : JSON.stringify(values.progress)}::jsonb, progress),
        result = coalesce(${values.result === undefined ? null : JSON.stringify(values.result)}::jsonb, result),
        error = coalesce(${values.error ?? null}, error),
        status = coalesce(${values.status ?? null}, status),
        finished_at = case when ${values.status ?? null} in ('completed', 'failed') then now() else finished_at end,
        heartbeat_at = now()
    where id = ${jobId}::uuid
  `);
}

async function processJob(job: JobRow) {
  const req = createOneDriveWorkerRequest(job.requested_by);
  await updateJob(job.id, { currentStep: "references", progress: { step: "references" } });
  const references = await syncOneDriveReferences(req);
  await updateJob(job.id, { currentStep: "SB9", progress: { step: "SB9", references: references.results } });
  const sb9 = await syncOneDriveSb9(req);
  await updateJob(job.id, {
    currentStep: "finished",
    progress: { step: "finished" },
    result: { ...references, results: [...references.results, sb9] },
    status: "completed",
  });
}

async function runOnce() {
  const job = await claimJob();
  if (!job) return false;
  try {
    await processJob(job);
    console.info("[OneDrive worker] job concluído", { jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na atualização do OneDrive.";
    await updateJob(job.id, { status: "failed", error: message, currentStep: "failed" });
    console.error("[OneDrive worker] job falhou", { jobId: job.id, message });
  }
  return true;
}

async function main() {
  console.info("[OneDrive worker] iniciado");
  while (true) {
    const processed = await runOnce();
    if (!processed) await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

void main().catch(error => {
  console.error("[OneDrive worker] encerrado", error);
  process.exitCode = 1;
});
