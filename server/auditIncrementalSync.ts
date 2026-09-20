export async function syncIncrementally(actor: PortalIdentity, options?: { db?: SyncDb; reader?: ReturnType<typeof createOperationalSourceRowReader> }): Promise<IncrementalSyncResult> {
  const db = options?.db ?? getSupabasePool();
  const client = await db.connect();
  // REGRA DE SEGURANÇA (pool max baixo): o leitor deve usar a MESMA conexão
  // retida acima. Consultar o pool durante o sync causaria deadlock: o pool
  // não teria conexão livre enquanto o sync espera a página.
  const reader = options?.reader ?? createOperationalSourceRowReader({ query: (sql, params) => client.query(sql, params) });
  let runId = ""; let rowsRead = 0; let findingCount = 0; let exceptionCount = 0; let duplicateCount = 0; let findingsNew = 0; let findingsUpdated = 0;
  try {
    const latest = await reader.listLatestProcessedBatchIds(); const missing = SOURCES.filter(source => !latest.has(source)); if (missing.length) throw new Error(`Fontes sem lote processado: ${missing.join(", ")}`);
    const index = await makeIndexes(reader, latest);
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