import { commitRegistrationImport, validateRegistrationRows } from "./registrationImports";
import { parseAgra045Xml, parseMata020Csv, SourceIssue } from "./protheusRegistrationParsers";
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
};

function isDifferent(current: string | null, next: string) {
  return (current ?? "") !== next;
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

export async function commitMata020Suppliers(content: string, identity: PortalIdentity) {
  const preview = await previewMata020Suppliers(content);
  if (!preview.valid) throw new TRPCError({ code: "BAD_REQUEST", message: "A prévia da MATA020 possui inconsistências. Revise antes de importar." });
  const parsed = parseMata020Csv(content);
  return commitRegistrationImport("suppliers", parsed.rows, identity, "protheus");
}

export async function commitAgra045Warehouses(content: string, identity: PortalIdentity) {
  const preview = await previewAgra045Warehouses(content);
  if (!preview.valid) throw new TRPCError({ code: "BAD_REQUEST", message: "A prévia do AGRA045 possui inconsistências. Revise antes de importar." });
  const parsed = parseAgra045Xml(content);
  return importCatalogEntries({ entity: "warehouse", rows: parsed.rows }, identity);
}
