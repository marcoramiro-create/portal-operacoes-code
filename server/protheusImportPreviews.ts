import { validateRegistrationRows } from "./registrationImports";
import { IGNORED_SI3_BRANCH_CODES, parseAgra045Xml, parseMata020Csv, parseSi3Csv, SourceIssue } from "./protheusRegistrationParsers";
import { assertApplicationPermission, getSupabasePool, PortalIdentity } from "./supabasePortal";
import { importCatalogEntries } from "./inventoryCatalogImports";
import { TRPCError } from "@trpc/server";

type PreviewSample = { code: string; name: string; secondary: string; action: "incluir" | "alterar" };
type ImportPreview = {
  valid: boolean;
  sourceRows: number;
  acceptedRows: number;
  skippedRows: number;
  issues: SourceIssue[];
  toCreate: number;
  toUpdate: number;
  unchanged: number;
  samples: PreviewSample[];
  ignoredRows?: number;
  ignoredBranchCodes?: string[];
};

function isDifferent(current: string | null, next: string) {
  return (current ?? "") !== next;
}

const ignoredSi3BranchCodes = new Set<string>(IGNORED_SI3_BRANCH_CODES);

export function filterSi3Rows<T extends { codigo_filial: string }>(rows: T[]) {
  const eligibleRows = rows.filter(row => !ignoredSi3BranchCodes.has(row.codigo_filial));
  const ignoredBranchCodes = Array.from(new Set(rows.filter(row => ignoredSi3BranchCodes.has(row.codigo_filial)).map(row => row.codigo_filial)));
  return { eligibleRows, ignoredRows: rows.length - eligibleRows.length, ignoredBranchCodes };
}

export async function previewMata020Suppliers(content: string): Promise<ImportPreview> {
  const parsed = parseMata020Csv(content);
  const validated = validateRegistrationRows("suppliers", parsed.rows);
  const issues = [...parsed.issues, ...validated.issues];
  if (issues.length) return { valid: false, sourceRows: parsed.sourceRows, acceptedRows: parsed.rows.length, skippedRows: parsed.skippedRows, issues, toCreate: 0, toUpdate: 0, unchanged: 0, samples: [] };
  const current = await getSupabasePool().query<{ supplier_code: string; store_code: string; legal_name: string; trade_name: string | null; document_number: string | null; active: boolean }>("select supplier_code, store_code, legal_name, trade_name, document_number, active from public.suppliers");
  const existing = new Map(current.rows.map(row => [`${row.supplier_code}::${row.store_code}`, row]));
  let toCreate = 0;
  let toUpdate = 0;
  let unchanged = 0;
  const samples: PreviewSample[] = [];
  for (const row of parsed.rows) {
    const found = existing.get(`${row.codigo_fornecedor}::${row.loja_fornecedor}`);
    if (!found) {
      toCreate += 1;
      if (samples.length < 20) samples.push({ code: row.codigo_fornecedor, name: row.razao_social, secondary: `Loja ${row.loja_fornecedor}`, action: "incluir" });
      continue;
    }
    const changed = !found.active || isDifferent(found.legal_name, row.razao_social) || isDifferent(found.trade_name, row.nome_fantasia) || isDifferent(found.document_number, row.cnpj_cpf.replace(/\D/g, ""));
    if (changed) {
      toUpdate += 1;
      if (samples.length < 20) samples.push({ code: row.codigo_fornecedor, name: row.razao_social, secondary: `Loja ${row.loja_fornecedor}`, action: "alterar" });
    } else unchanged += 1;
  }
  return { valid: true, sourceRows: parsed.sourceRows, acceptedRows: parsed.rows.length, skippedRows: parsed.skippedRows, issues: [], toCreate, toUpdate, unchanged, samples };
}

export async function previewAgra045Warehouses(content: string, identity?: PortalIdentity): Promise<ImportPreview & { companyCode?: string; branchCode?: string }> {
  if (identity) await assertApplicationPermission(identity, "cadastros-armazens", "manage");
  const parsed = parseAgra045Xml(content);
  const source = parsed.rows[0];
  const issues = [...parsed.issues];
  if (!source) return { valid: false, sourceRows: parsed.sourceRows, acceptedRows: 0, skippedRows: parsed.skippedRows, issues: [{ row: 0, field: "Arquivo", message: "Nenhum armazém foi encontrado." }], toCreate: 0, toUpdate: 0, unchanged: 0, samples: [] };
  const branch = await getSupabasePool().query<{ id: string }>("select branch.id from public.branches branch join public.companies company on company.id = branch.company_id where company.code = $1 and branch.code = $2 and company.active and branch.active limit 1", [source.codigo_empresa, source.codigo_filial]);
  if (!branch.rows[0]) issues.push({ row: 0, field: "Filial", message: `A filial ativa ${source.codigo_empresa} / ${source.codigo_filial} ainda não está cadastrada no portal.` });
  if (issues.length) return { valid: false, sourceRows: parsed.sourceRows, acceptedRows: parsed.rows.length, skippedRows: parsed.skippedRows, issues, toCreate: 0, toUpdate: 0, unchanged: 0, samples: [], companyCode: source.codigo_empresa, branchCode: source.codigo_filial };
  const current = await getSupabasePool().query<{ code: string; name: string; active: boolean }>("select code, name, active from public.warehouses where branch_id = $1", [branch.rows[0].id]);
  const existing = new Map(current.rows.map(row => [row.code, row]));
  let toCreate = 0;
  let toUpdate = 0;
  let unchanged = 0;
  const samples: PreviewSample[] = [];
  for (const row of parsed.rows) {
    const found = existing.get(row.codigo);
    if (!found) {
      toCreate += 1;
      if (samples.length < 20) samples.push({ code: row.codigo, name: row.nome, secondary: `${row.codigo_empresa} / ${row.codigo_filial}`, action: "incluir" });
    } else if (!found.active || isDifferent(found.name, row.nome)) {
      toUpdate += 1;
      if (samples.length < 20) samples.push({ code: row.codigo, name: row.nome, secondary: `${row.codigo_empresa} / ${row.codigo_filial}`, action: "alterar" });
    } else unchanged += 1;
  }
  return { valid: true, sourceRows: parsed.sourceRows, acceptedRows: parsed.rows.length, skippedRows: parsed.skippedRows, issues: [], toCreate, toUpdate, unchanged, samples, companyCode: source.codigo_empresa, branchCode: source.codigo_filial };
}

export async function previewSi3CostCenters(content: string): Promise<ImportPreview> {
  const parsed = parseSi3Csv(content);
  const filtered = filterSi3Rows(parsed.rows);
  const issues = [...parsed.issues];
  const branchCodes = Array.from(new Set(filtered.eligibleRows.map(row => row.codigo_filial)));
  const branches = await getSupabasePool().query<{ id: string; code: string }>("select branch.id, branch.code from public.branches branch join public.companies company on company.id = branch.company_id where branch.code = any($1::text[]) and company.active = true and branch.active = true", [branchCodes]);
  const branchByCode = new Map<string, string>();
  for (const branch of branches.rows) {
    if (branchByCode.has(branch.code)) issues.push({ row: 0, field: "Filial", message: `A filial ${branch.code} é ambígua entre empresas ativas; o SI3 precisa ser separado ou receber o código da empresa.` });
    else branchByCode.set(branch.code, branch.id);
  }
  const missingBranches = new Set<string>();
  for (const row of filtered.eligibleRows) if (!branchByCode.has(row.codigo_filial)) missingBranches.add(row.codigo_filial);
  for (const branchCode of Array.from(missingBranches)) issues.push({ row: 0, field: "Filial", message: `A filial ativa ${branchCode} ainda não está cadastrada no portal.` });
  if (issues.length) return { valid: false, sourceRows: parsed.sourceRows, acceptedRows: filtered.eligibleRows.length, skippedRows: parsed.skippedRows, issues, toCreate: 0, toUpdate: 0, unchanged: 0, samples: [], ignoredRows: filtered.ignoredRows, ignoredBranchCodes: filtered.ignoredBranchCodes };
  const current = await getSupabasePool().query<{ branch_id: string; code: string; name: string; active: boolean }>("select branch_id, code, name, active from public.cost_centers where branch_id = any($1::uuid[])", [Array.from(branchByCode.values())]);
  const existing = new Map(current.rows.map(row => [`${row.branch_id}:${row.code}`, row]));
  let toCreate = 0;
  let toUpdate = 0;
  let unchanged = 0;
  const samples: PreviewSample[] = [];
  for (const row of filtered.eligibleRows) {
    const found = existing.get(`${branchByCode.get(row.codigo_filial)}:${row.codigo}`);
    if (!found) { toCreate += 1; if (samples.length < 20) samples.push({ code: row.codigo, name: row.nome, secondary: `Filial ${row.codigo_filial}`, action: "incluir" }); }
    else if (!found.active || isDifferent(found.name, row.nome)) { toUpdate += 1; if (samples.length < 20) samples.push({ code: row.codigo, name: row.nome, secondary: `Filial ${row.codigo_filial}`, action: "alterar" }); }
    else unchanged += 1;
  }
  return { valid: true, sourceRows: parsed.sourceRows, acceptedRows: filtered.eligibleRows.length, skippedRows: parsed.skippedRows, issues: [], toCreate, toUpdate, unchanged, samples, ignoredRows: filtered.ignoredRows, ignoredBranchCodes: filtered.ignoredBranchCodes };
}

export async function commitMata020Suppliers(content: string, identity: PortalIdentity) {
  const preview = await previewMata020Suppliers(content);
  if (!preview.valid) throw new TRPCError({ code: "BAD_REQUEST", message: "A prévia da MATA020 possui inconsistências. Revise antes de importar." });
  const parsed = parseMata020Csv(content);
  const client = await getSupabasePool().connect();
  try {
    await client.query("begin");
    for (let start = 0; start < parsed.rows.length; start += 500) {
      const batch = parsed.rows.slice(start, start + 500).map(row => ({ ...row, cnpj_cpf: row.cnpj_cpf.replace(/\D/g, "") }));
      await client.query(`insert into public.suppliers (supplier_code, store_code, legal_name, trade_name, document_number, active)
        select codigo_fornecedor, loja_fornecedor, razao_social, nullif(nome_fantasia, ''), nullif(cnpj_cpf, ''), true
        from jsonb_to_recordset($1::jsonb) as source(codigo_fornecedor text, loja_fornecedor text, cnpj_cpf text, razao_social text, nome_fantasia text, ativo text)
        on conflict (supplier_code, store_code) do update set legal_name = excluded.legal_name, trade_name = excluded.trade_name, document_number = excluded.document_number, active = true, updated_at = now()`, [JSON.stringify(batch)]);
    }
    await client.query("insert into public.audit_events (actor_user_id, entity_type, action, details) values ($1, 'suppliers', 'protheus_imported', jsonb_build_object('source', 'MATA020', 'rows', $2::int))", [identity.id, parsed.rows.length]);
    await client.query("commit");
    return { success: true as const, importedRows: parsed.rows.length };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function commitSi3CostCenters(content: string, identity: PortalIdentity) {
  const preview = await previewSi3CostCenters(content);
  if (!preview.valid) throw new TRPCError({ code: "BAD_REQUEST", message: "A prévia da SI3 possui inconsistências. Revise antes de importar." });
  const parsed = parseSi3Csv(content);
  const filtered = filterSi3Rows(parsed.rows);
  return importCatalogEntries({ entity: "costCenter", rows: filtered.eligibleRows.map(row => ({ codigo_filial: row.codigo_filial, codigo: row.codigo, nome: row.nome, ativo: row.ativo })) }, identity);
}

export async function commitAgra045Warehouses(content: string, identity: PortalIdentity) {
  const preview = await previewAgra045Warehouses(content);
  if (!preview.valid) throw new TRPCError({ code: "BAD_REQUEST", message: "A prévia do AGRA045 possui inconsistências. Revise antes de importar." });
  const parsed = parseAgra045Xml(content);
  return importCatalogEntries({ entity: "warehouse", rows: parsed.rows }, identity);
}
