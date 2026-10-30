import type { Request } from "express";
import { syncOneDriveReferences } from "./oneDriveReferenceSync";
import { syncOneDriveSb9 } from "./oneDriveCostSync";

type SyncResult = Awaited<ReturnType<typeof syncOneDriveReferences>> & {
  results: Array<{ kind: string; fileName: string; status: string; count: number; updatedAt: string }>;
};
type Job =
  | { status: "running"; startedAt: string }
  | { status: "completed"; startedAt: string; finishedAt: string; result: SyncResult }
  | { status: "failed"; startedAt: string; finishedAt: string; error: string };

const jobs = new Map<string, Job>();
let activeJobId: string | null = null;

export function startOneDriveSync(req: Request) {
  if (activeJobId && jobs.get(activeJobId)?.status === "running") {
    return { jobId: activeJobId, status: "running" as const };
  }

  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const startedAt = new Date().toISOString();
  jobs.set(jobId, { status: "running", startedAt });
  activeJobId = jobId;

  void (async () => {
    try {
      const references = await syncOneDriveReferences(req);
      const sb9 = await syncOneDriveSb9(req);
      jobs.set(jobId, {
        status: "completed",
        startedAt,
        finishedAt: new Date().toISOString(),
        result: { ...references, results: [...references.results, sb9] },
      });
    } catch (error) {
      jobs.set(jobId, {
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Falha na atualização do OneDrive.",
      });
    } finally {
      if (activeJobId === jobId) activeJobId = null;
    }
  })();

  return { jobId, status: "running" as const };
}

export function getOneDriveSyncJob(jobId: string) {
  return jobs.get(jobId) ?? { status: "failed" as const, error: "Atualização não encontrada. Inicie uma nova atualização." };
}
