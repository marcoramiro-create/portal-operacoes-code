import { cleanSourceText, normalizeBranchCode, normalizeProductCode } from "./operationalNormalization";
import { createOperationalSourceRowReader, type OperationalSourceKind, type SourceRowPage } from "./operationalSourceRowReader";
import { getSupabasePool, type PortalIdentity } from "./supabasePortal";
import { createHash } from "node:crypto";

export type IncrementalFinding = { category: "EXCECAO" | "DUPLICIDADE"; kind: string; scope: string | null; source: string; sourceKey: string; detail: string };
export type IncrementalSyncResult = { runId: string; rowsRead: number; findingsNew: number; findingsUpdated: number; findingCount: number; exceptionCount: number; duplicateCount: number };
export type SyncDb = { connect(): Promise<SyncClient> };
export type SyncClient = { query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number }>; release(): void };
const SOURCES: OperationalSourceKind[] = ["SB1", "SBZ", "SB5", "SA2", "PEDIDO_COMPRA", "NF_LEGAL", "FECHAMENTO_ESTOQUE"];
const text = (row: Record<string, unknown>, names: string[]) => { for (const name of names) if (row[name] !== undefined && row[name] !== null) return cleanSourceText(row[name]); return ""; };
const rows = (page: SourceRowPage) => page.rows.map(x => x.payload && typeof x.payload === "object" ? x.payload as Record<string, unknown> : {});
export const incrementalFingerprint = (f: IncrementalFinding) => createHash("sha256").update([f.category, f.kind, f.scope ?? "", f.source, f.sourceKey].join("|")).digest("hex");
const finding = (category: IncrementalFinding["category"], kind: string, source: string, sourceKey: string, detail: string, scope: string | null = null): IncrementalFinding => ({ category, kind, source, sourceKey, detail, scope });

type Indexes = { sb1: Set<string>; aggregates: Set<string>; sb1Counts: Map<string, number>; sbz: Set<string>; sbzCounts: Map<string, number>; sa2: Map<string, number> };
const inc = (m: Map<string, number>, k: string) => { if (k) m.set(k, (m.get(k) ?? 0) + 1); };
async function makeIndexes(reader: ReturnType<typeof createOperationalSourceRowReader>, latest: Map<OperationalSourceKind, string>): Promise<Indexes> {
  const index: Indexes = { sb1: new Set(), aggregates: new Set(), sb1Counts: new Map(), sbz: new Set(), sbzCounts: new Map(), sa2: new Map() };
  const consume = async (source: OperationalSourceKind, fn: (row: Record<string, unknown>) => void) => { const id = latest.get(source); if (!id) return; for await (const page of reader.readSourceBatchPages(id)) for (const row of rows(page)) fn(row); };
  await consume("SB1", row => { const code = normalizeProductCode(text(row, ["normalizedProductCode", "productCode"])); const aggregate = normalizeProductCode(text(row, ["normalizedAggregateProductCode", "aggregateProductCode"])); if (code) { index.sb1.add(code); inc(index.sb1Counts, code); } if (aggregate) index.aggregates.add(aggregate); });
  await consume("SBZ", row => { const key = `${normalizeBranchCode(text(row, ["branchCode"]))}|${normalizeProductCode(text(row, ["productCode"]))}`; if (key !== "|") { index.sbz.add(key); inc(index.sbzCounts, key); } });
  await consume("SA2", row => inc(index.sa2, text(row, ["document"]).replace(/\D/g, "")));
  return index;
}

function duplicateFindings(source: OperationalSourceKind, counts: Map<string, number>): IncrementalFinding[] {
  const scope = source === "SB1" ? "SB1.Codigo" : source === "SBZ" ? "SBZ.Filial+Codigo" : source === "SA2" ? "SA2.Documento" : source === "PEDIDO_COMPRA" ? "Pedidos.Chave" : source === "NF_LEGAL" ? "NF_LEGAL.Documento" : "";
  if (!scope) return [];
  const findingSource = source === "PEDIDO_COMPRA" ? "Pedidos" : source;
  const result: IncrementalFinding[] = [];
  for (const [key, occurrences] of counts) if (key && occurrences > 1) result.push(finding("DUPLICIDADE", "CHAVE_DUPLICADA", findingSource, key, `A chave ${key} aparece ${occurrences} vezes no escopo ${scope}.`, scope));
  return result;
}
function findingsForPage(source: OperationalSourceKind, page: SourceRowPage, index: Indexes): IncrementalFinding[] {
  const out: IncrementalFinding[] = [];
  for (const row of rows(page)) {
    if (source === "SBZ") { const code = normalizeProductCode(text(row, ["productCode"])); const branch = normalizeBranchCode(text(row, ["branchCode"])); if (code && !index.sb1.has(code) && !index.aggregates.has(code)) out.push(finding("EXCECAO", "PRODUTO_NAO_ENCONTRADO_SB1", "SBZ", `${branch}|${code}`, `Produto ${code} da SBZ não encontrado na SB1 (direto ou agregado).`)); }
    else if (source === "SB5") { const code = normalizeProductCode(text(row, ["productCode"])); if (code && !index.sb1.has(code) && !index.aggregates.has(code)) out.push(finding("EXCECAO", "PRODUTO_NAO_ENCONTRADO_SB1", "SB5", code, `Produto ${code} da SB5 não encontrado na SB1 (direto ou agregado).`)); }
    else if (source === "PEDIDO_COMPRA") { const code = normalizeProductCode(text(row, ["productCode"])); const branch = normalizeBranchCode(text(row, ["branch"])); const key = text(row, ["key"]) || `${branch}|${text(row,["orderNumber"])}|${text(row,["orderItem"])}`; if (!index.sb1.has(code) && !index.aggregates.has(code)) out.push(finding("EXCECAO", "PRODUTO_NAO_ENCONTRADO_SB1", "PEDIDO_COMPRA", key, `Produto ${code} do pedido não encontrado na SB1 (direto ou agregado).`)); if (!index.sbz.has(`${branch}|${code}`)) out.push(finding("EXCECAO", "PRODUTO_SEM_SBZ_FILIAL", "PEDIDO_COMPRA", key, `Produto ${code} sem ampliação SBZ na filial ${branch}.`)); }
    else if (source === "NF_LEGAL") { const key = text(row, ["key"]); const doc = text(row, ["supplierDocument"]).replace(/\D/g, ""); if (!doc) out.push(finding("EXCECAO", "NF_SEM_DOCUMENTO_FORNECEDOR", "NF_LEGAL", key, `NF ${text(row,["invoiceNumber"])} sem CNPJ/CPF utilizável para cruzar com a SA2.`)); else if (!index.sa2.has(doc)) out.push(finding("EXCECAO", "FORNECEDOR_NAO_ENCONTRADO_SA2", "NF_LEGAL", key, `Fornecedor com documento ${doc} não localizado na SA2.`)); else if ((index.sa2.get(doc) ?? 0) > 1) out.push(finding("DUPLICIDADE", "CHAVE_DUPLICADA", "NF_LEGAL", key, `Documento ${doc} aparece ${index.sa2.get(doc)} vezes na SA2.`, "SA2.Documento")); }
    else if (source === "FECHAMENTO_ESTOQUE") { const code = normalizeProductCode(text(row, ["productCode"])); const aggregate = normalizeProductCode(text(row, ["aggregateProductCode"])); const branch = normalizeBranchCode(text(row, ["branch"])); if (!index.sb1.has(code) && !index.aggregates.has(aggregate || code)) out.push(finding("EXCECAO", "PRODUTO_NAO_ENCONTRADO_SB1", "ESTOQUE", `${branch}|${code}`, `Produto ${code} (agregado ${aggregate || "vazio"}) do estoque não encontrado na SB1.`)); }
  }
  return out;
}

export async function syncIncrementally(actor: PortalIdentity, options?: { db?: SyncDb; reader?: ReturnType<typeof createOperationalSourceRowReader> }): Promise<IncrementalSyncResult> {
  const db = options?.db ?? getSupabasePool(); const reader = options?.reader ?? createOperationalSourceRowReader(); const latest = await reader.listLatestProcessedBatchIds(); const missing = SOURCES.filter(source => !latest.has(source)); if (missing.length) throw new Error(`Fontes sem lote processado: ${missing.join(", ")}`);
  const index = await makeIndexes(reader, latest); const client = await db.connect(); let runId = ""; let rowsRead = 0; let findingCount = 0; let exceptionCount = 0; let duplicateCount = 0; let findingsNew = 0; let findingsUpdated = 0;
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('portal-audit-backlog-sync'))");
    const run = await client.query<{ id: string }>(`insert into public.audit_runs (triggered_by,metrics) values ($1,'{}'::jsonb) returning id`, [actor.id]); runId = run.rows[0].id;
    for (const source of SOURCES) {
      const batch = latest.get(source)!;
      const duplicateCounts = new Map<string, number>();
      for await (const page of reader.readSourceBatchPages(batch)) {
        rowsRead += page.rows.length;
        for (const row of rows(page)) {
          const key = source === "SB1" ? text(row, ["productCode", "codigo", "Codigo"]) : source === "SBZ" ? `${normalizeBranchCode(text(row,["branchCode"]))}|${normalizeProductCode(text(row,["productCode"]))}` : source === "PEDIDO_COMPRA" ? text(row,["key"]) : source === "NF_LEGAL" ? text(row,["key"]) : source === "SA2" ? text(row,["document"]).replace(/\D/g, "") : "";
          if (key) inc(duplicateCounts, key);
        }
        for (const f of findingsForPage(source, page, index)) { findingCount += 1; if (f.category === "EXCECAO") exceptionCount += 1; else duplicateCount += 1; const key = incrementalFingerprint(f); const inserted = await client.query(`insert into public.audit_findings (finding_key,category,kind,scope,source,source_key,detail,last_run_id) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (finding_key) do nothing returning id`, [key,f.category,f.kind,f.scope,f.source,f.sourceKey,f.detail,runId]); if (inserted.rowCount) findingsNew += 1; else { await client.query(`update public.audit_findings set detail=$2,last_seen_at=now(),occurrences=occurrences+1,last_run_id=$3 where finding_key=$1`, [key,f.detail,runId]); findingsUpdated += 1; } }
      }
      for (const f of duplicateFindings(source, duplicateCounts)) { findingCount += 1; duplicateCount += 1; const key = incrementalFingerprint(f); const inserted = await client.query(`insert into public.audit_findings (finding_key,category,kind,scope,source,source_key,detail,last_run_id) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (finding_key) do nothing returning id`, [key,f.category,f.kind,f.scope,f.source,f.sourceKey,f.detail,runId]); if (inserted.rowCount) findingsNew += 1; else { await client.query(`update public.audit_findings set detail=$2,last_seen_at=now(),occurrences=occurrences+1,last_run_id=$3 where finding_key=$1`, [key,f.detail,runId]); findingsUpdated += 1; } }
    }
    await client.query(`update public.audit_runs set finished_at=now(),metrics=$2::jsonb,findings_new=$3,findings_updated=$4,exception_count=$5,duplicate_count=$6 where id=$1`, [runId,JSON.stringify({ rowsRead, findingCount, exceptionCount, duplicateCount }),findingsNew,findingsUpdated,exceptionCount,duplicateCount]); await client.query("commit"); return { runId, rowsRead, findingsNew, findingsUpdated, findingCount, exceptionCount, duplicateCount };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function processFindingsIncrementally(
  reader: OperationalSourceRowReader,
  batches: Map<OperationalSourceKind, string>,
  processor: (source: OperationalSourceKind, page: SourceRowPage) => IncrementalFinding[],
  writeFinding: (finding: IncrementalFinding) => Promise<void>,
): Promise<{ rowsRead: number; findingsWritten: number }> {
  let rowsRead = 0;
  let findingsWritten = 0;
  for (const [source, batchId] of batches) {
    for await (const page of reader.readSourceBatchPages(batchId)) {
      rowsRead += page.rows.length;
      for (const f of processor(source, page)) { await writeFinding(f); findingsWritten += 1; }
    }
  }
  return { rowsRead, findingsWritten };
}

export { duplicateFindings, findingsForPage, makeIndexes };
