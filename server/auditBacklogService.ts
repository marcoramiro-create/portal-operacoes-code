import { createHash } from "node:crypto";
import { getSupabasePool, type PortalIdentity } from "./supabasePortal";
import { syncIncrementally } from "./auditIncrementalSync";
import type { AuditDuplicate, AuditException, AuditSourceMetric } from "./operationalAuditService";

export type AuditFindingCategory = "EXCECAO" | "DUPLICIDADE";
export type AuditTreatmentStatus = "aberto" | "em_tratativa" | "resolvido" | "ignorado";
export type AuditPriority = "alta" | "media" | "baixa";
export type AuditFinding = { category: AuditFindingCategory; kind: string; scope: string | null; source: string; sourceKey: string; detail: string };

export function findingFingerprint(finding: AuditFinding): string {
  const raw = [finding.category, finding.kind, finding.scope ?? "", finding.source, finding.sourceKey].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

export function findingsFromReport(report: { exceptions: AuditException[]; duplicates: AuditDuplicate[] }): AuditFinding[] {
  return [
    ...report.exceptions.map(item => ({ category: "EXCECAO" as const, kind: item.kind, scope: null, source: item.source, sourceKey: item.sourceKey, detail: item.detail })),
    ...report.duplicates.map(item => ({ category: "DUPLICIDADE" as const, kind: "CHAVE_DUPLICADA", scope: item.scope, source: item.scope.split(".")[0], sourceKey: item.key, detail: `A chave ${item.key} aparece ${item.occurrences} vezes no escopo ${item.scope}.` })),
  ];
}

export function auditSyncIsReadyForSqlPath(): true {
  return true;
}

export async function syncAuditFindings(actor: PortalIdentity) {
  return syncIncrementally(actor);
}

export async function getBacklogKpis() {
  const db = getSupabasePool();
  const result = await db.query(`select count(*) filter (where coalesce(t.status,'aberto') not in ('resolvido','ignorado'))::int as open_count, count(*) filter (where t.due_date < current_date and coalesce(t.status,'aberto') not in ('resolvido','ignorado'))::int as overdue_count, count(*) filter (where t.status='resolvido' and t.resolved_at >= now() - interval '30 days')::int as resolved_30d, count(*)::int as total_count from public.audit_findings f left join public.audit_finding_treatments t on t.finding_id=f.id`);
  return result.rows[0];
}

export type AuditKpiPayload = { metrics: AuditSourceMetric[]; openCount: number; overdueCount: number; resolved30d: number; totalCount: number };

export async function listAuditFindings(filters: { status?: AuditTreatmentStatus; source?: string; category?: AuditFindingCategory; limit: number; offset: number }) {
  const db = getSupabasePool();
  const values: unknown[] = [];
  const where: string[] = [];
  if (filters.status) { values.push(filters.status); where.push(`coalesce(t.status, 'aberto') = $${values.length}`); }
  if (filters.source) { values.push(filters.source); where.push(`f.source = $${values.length}`); }
  if (filters.category) { values.push(filters.category); where.push(`f.category = $${values.length}`); }
  values.push(filters.limit, filters.offset);
  const result = await db.query(`select f.id, f.finding_key as "findingKey", f.category, f.kind, f.scope, f.source, f.source_key as "sourceKey", f.detail, f.first_seen_at as "firstSeenAt", f.last_seen_at as "lastSeenAt", f.occurrences, coalesce(t.status,'aberto') as status, coalesce(t.priority,'media') as priority, coalesce(t.responsible_name,'') as "responsibleName", t.due_date as "dueDate", coalesce(t.note,'') as note from public.audit_findings f left join public.audit_finding_treatments t on t.finding_id=f.id ${where.length ? `where ${where.join(' and ')}` : ''} order by f.last_seen_at desc, f.created_at desc limit $${values.length - 1} offset $${values.length}`, values);
  return result.rows;
}

export async function upsertAuditTreatment(input: { findingId: string; status: AuditTreatmentStatus; priority: AuditPriority; responsibleName: string; dueDate?: string | null; note?: string }, actor: PortalIdentity) {
  const db = getSupabasePool();
  const client = await db.connect();
  try {
    await client.query("begin");
    const previous = await client.query(`select status, priority, responsible_name as "responsibleName", due_date as "dueDate", note from public.audit_finding_treatments where finding_id=$1`, [input.findingId]);
    await client.query(`insert into public.audit_finding_treatments (finding_id,status,priority,responsible_name,due_date,note,updated_by,resolved_by,resolved_at) values ($1,$2,$3,$4,$5,$6,$7,case when $2='resolvido' then $7 else null end,case when $2='resolvido' then now() else null end) on conflict (finding_id) do update set status=excluded.status, priority=excluded.priority, responsible_name=excluded.responsible_name, due_date=excluded.due_date, note=excluded.note, updated_by=excluded.updated_by, resolved_by=case when excluded.status='resolvido' then excluded.updated_by else audit_finding_treatments.resolved_by end, resolved_at=case when excluded.status='resolvido' then now() else null end, updated_at=now()`, [input.findingId, input.status, input.priority, input.responsibleName, input.dueDate ?? null, input.note ?? '', actor.id]);
    await client.query(`insert into public.audit_treatment_events (finding_id, actor_user_id, changes) values ($1,$2,$3::jsonb)`, [input.findingId, actor.id, JSON.stringify({ previous: previous.rows[0] ?? null, next: input })]);
    await client.query("commit");
    return { success: true };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}
