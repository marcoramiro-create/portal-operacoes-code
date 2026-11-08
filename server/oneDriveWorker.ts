import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { syncOneDriveReferences } from "./oneDriveReferenceSync";
import { createOneDriveWorkerRequest } from "./oneDriveOAuth";

type JobRow = { id: string; requested_by: string; progress?: Record<string, unknown> | null };

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
    returning job.id, job.requested_by, job.progress
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

// Jobs de redução (kind=summary): o script validado
// scripts/protheusSummaryUpload.ts roda em PROCESSO ISOLADO
// (spawn), com log capturado para o job — o worker e o portal
// ficam livres durante a execução (arquivos de 276 MB levam
// minutos; nunca dentro do processo do worker).
import { spawn } from "node:child_process";

const SUMMARY_TIMEOUT_MS = 30 * 60 * 1000; // 30 min por produto

function runSummaryScript(product: string): Promise<{ code: number; log: string }> {
  return new Promise(resolve => {
    const child = spawn(
      "npx",
      ["tsx", "--env-file=.env", "scripts/protheusSummaryUpload.ts", `--product=${product}`],
      { cwd: "/home/ubuntu/portal-operacoes-homolog", env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let log = "";
    const collect = (chunk: unknown) => {
      log += String(chunk);
      // Mantém o log no tamanho de um job (últimas ~8 KB).
      if (log.length > 8_192) log = log.slice(-8_192);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => child.kill("SIGKILL"), SUMMARY_TIMEOUT_MS);
    child.on("close", code => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, log });
    });
    child.on("error", error => {
      clearTimeout(timer);
      resolve({ code: -1, log: `${log}\nERRO ao iniciar o processo: ${error.message}` });
    });
  });
}

async function processSummaryJob(job: JobRow, product: string) {
  await updateJob(job.id, { currentStep: "summary", progress: { kind: "summary", product, step: "running" } });
  const { code, log } = await runSummaryScript(product);
  const publicada = log.includes("| Publicada |");
  const semAlteracao = log.includes("Sem alteração");
  await updateJob(job.id, {
    currentStep: "finished",
    progress: { kind: "summary", product, step: "finished", log: log.slice(-4_096) },
    result: { product, exitCode: code, publicada, semAlteracao },
    status: code === 0 && (publicada || semAlteracao || log.includes("--dry-run")) ? "completed" : "failed",
    error: code === 0 ? undefined : log.slice(-2_000),
  });
}

async function processJob(job: JobRow) {
  const req = createOneDriveWorkerRequest(job.requested_by);
  // Job de redução? Roteia para o fluxo próprio (spawn isolado).
  const progressRaw = job.progress ?? {};
  const product = typeof progressRaw.product === "string" ? progressRaw.product : null;
  if (progressRaw.kind === "summary" && product) {
    await processSummaryJob(job, product);
    return;
  }
  await updateJob(job.id, { currentStep: "references", progress: { step: "references" } });
  const references = await syncOneDriveReferences(req);
  await updateJob(job.id, {
    currentStep: "finished",
    progress: { step: "finished" },
    result: references,
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
