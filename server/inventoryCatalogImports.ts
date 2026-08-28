import { TRPCError } from "@trpc/server";
import { CatalogEntity } from "./inventoryCatalog";
import { assertApplicationPermission, getSupabasePool, PortalIdentity } from "./supabasePortal";

export type CatalogImportEntity = CatalogEntity;
export type CatalogImportRow = Record<string, string>;

const nodeKeys: Record<CatalogImportEntity, string> = { productType: "cadastros-tipos-produto", orgUnit: "cadastros-unidades", costCenter: "cadastros-centros-custo", company: "cadastros-empresas", branch: "cadastros-filiais", warehouse: "cadastros-armazens", stockLocation: "cadastros-locais-estoque" };
const importNodeKeys: Record<CatalogImportEntity, string> = { productType: "importacoes-tipos-produto", orgUnit: "importacoes-unidades", costCenter: "importacoes-centros-custo", company: "importacoes-empresas", branch: "importacoes-filiais", warehouse: "importacoes-armazens", stockLocation: "importacoes-locais-estoque" };

export function getCatalogImportMaxRows(entity: CatalogImportEntity) {
  return entity === "costCenter" ? 10_000 : 500;
}

function required(row: CatalogImportRow, field: string, rowNumber: number) {
  const value = String(row[field] ?? "").trim();
  if (!value) throw new TRPCError({ code: "BAD_REQUEST", message: `Linha ${rowNumber}: ${field} é obrigatório.` });
  return value;
}

function yesNo(value: string | undefined, field: string, rowNumber: number, defaultValue = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (["sim", "s", "true", "1", "ativo"].includes(normalized)) return true;
  if (["não", "nao", "n", "false", "0", "inativo"].includes(normalized)) return false;
  throw new TRPCError({ code: "BAD_REQUEST", message: `Linha ${rowNumber}: ${field} deve usar SIM ou NÃO.` });
}

async function findId(client: { query: Function }, table: string, clauses: string, values: string[], label: string, rowNumber: number) {
  const result = await client.query(`select id from public.${table} where ${clauses} and active = true limit 1`, values);
  if (!result.rows[0]?.id) throw new TRPCError({ code: "BAD_REQUEST", message: `Linha ${rowNumber}: ${label} ativo não encontrado.` });
  return result.rows[0].id as string;
}

export async function importCatalogEntries(input: { entity: CatalogImportEntity; rows: CatalogImportRow[]; centralized?: boolean }, identity: PortalIdentity) {
  await assertApplicationPermission(identity, input.centralized ? importNodeKeys[input.entity] : nodeKeys[input.entity], "manage");
  const maxRows = getCatalogImportMaxRows(input.entity);
  if (!input.rows.length || input.rows.length > maxRows) throw new TRPCError({ code: "BAD_REQUEST", message: `Informe de 1 a ${maxRows.toLocaleString("pt-BR")} linhas para importar.` });
  const client = await getSupabasePool().connect();
  try {
    await client.query("begin");
    for (let index = 0; index < input.rows.length; index += 1) {
      const row = input.rows[index];
      const line = index + 2;
      const code = required(row, "codigo", line);
      const name = required(row, "nome", line);
      const active = yesNo(row.ativo, "ativo", line, true);
      if (input.entity === "company") await client.query("insert into public.companies (code, legal_name, trade_name, tax_id, active) values ($1, $2, nullif($3, ''), nullif($4, ''), $5) on conflict (code) do update set legal_name = excluded.legal_name, trade_name = excluded.trade_name, tax_id = excluded.tax_id, active = excluded.active, updated_at = now()", [code, name, String(row.nome_fantasia ?? "").trim(), String(row.cnpj ?? "").replace(/\D/g, ""), active]);
      if (input.entity === "orgUnit") await client.query("insert into public.org_units (code, name, active) values ($1, $2, $3) on conflict (code) do update set name = excluded.name, active = excluded.active, updated_at = now()", [code, name, active]);
      if (input.entity === "productType") await client.query("insert into public.product_types (code, name, description, stock_controlled, active) values ($1, $2, nullif($3, ''), $4, $5) on conflict (code) do update set name = excluded.name, description = excluded.description, stock_controlled = excluded.stock_controlled, active = excluded.active, updated_at = now()", [code, name, String(row.descricao ?? "").trim(), yesNo(row.controla_estoque, "controla_estoque", line, true), active]);
      if (input.entity === "costCenter") { const branchCode = required(row, "codigo_filial", line); const branchId = await findId(client, "branches", "code = $1", [branchCode], "Filial", line); const unitCode = String(row.codigo_unidade ?? "").trim(); const unitId = unitCode ? await findId(client, "org_units", "code = $1", [unitCode], "Unidade", line) : null; await client.query("insert into public.cost_centers (branch_id, code, name, unit_id, active) values ($1, $2, $3, $4, $5) on conflict (branch_id, code) do update set name = excluded.name, unit_id = excluded.unit_id, active = excluded.active, updated_at = now()", [branchId, code, name, unitId, active]); }
      if (input.entity === "branch") { const companyId = await findId(client, "companies", "code = $1", [required(row, "codigo_empresa", line)], "Empresa", line); await client.query("insert into public.branches (company_id, code, name, tax_id, active) values ($1, $2, $3, nullif($4, ''), $5) on conflict (company_id, code) do update set name = excluded.name, tax_id = excluded.tax_id, active = excluded.active, updated_at = now()", [companyId, code, name, String(row.cnpj ?? "").replace(/\D/g, ""), active]); }
      if (input.entity === "warehouse") { const companyCode = required(row, "codigo_empresa", line); const branchCode = required(row, "codigo_filial", line); const branch = await client.query("select branch.id from public.branches branch join public.companies company on company.id = branch.company_id where company.code = $1 and branch.code = $2 and company.active = true and branch.active = true limit 1", [companyCode, branchCode]); if (!branch.rows[0]?.id) throw new TRPCError({ code: "BAD_REQUEST", message: `Linha ${line}: filial ativa não encontrada.` }); await client.query("insert into public.warehouses (branch_id, code, name, active) values ($1, $2, $3, $4) on conflict (branch_id, code) do update set name = excluded.name, active = excluded.active, updated_at = now()", [branch.rows[0].id, code, name, active]); }
      if (input.entity === "stockLocation") { const companyCode = required(row, "codigo_empresa", line); const branchCode = required(row, "codigo_filial", line); const warehouseCode = required(row, "codigo_armazem", line); const warehouse = await client.query("select warehouse.id from public.warehouses warehouse join public.branches branch on branch.id = warehouse.branch_id join public.companies company on company.id = branch.company_id where company.code = $1 and branch.code = $2 and warehouse.code = $3 and company.active = true and branch.active = true and warehouse.active = true limit 1", [companyCode, branchCode, warehouseCode]); if (!warehouse.rows[0]?.id) throw new TRPCError({ code: "BAD_REQUEST", message: `Linha ${line}: armazém ativo não encontrado.` }); await client.query("insert into public.stock_locations (warehouse_id, code, name, active) values ($1, $2, $3, $4) on conflict (warehouse_id, code) do update set name = excluded.name, active = excluded.active, updated_at = now()", [warehouse.rows[0].id, code, name, active]); }
    }
    await client.query("insert into public.audit_events (actor_user_id, entity_type, action, details) values ($1, $2, 'spreadsheet_imported', jsonb_build_object('rows', $3::int))", [identity.id, input.entity, input.rows.length]);
    await client.query("commit");
    return { importedRows: input.rows.length };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}
