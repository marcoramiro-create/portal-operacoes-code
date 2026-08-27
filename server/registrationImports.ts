import { TRPCError } from "@trpc/server";
import { PoolClient } from "pg";
import { normalizeCell, parseActive, parseYesNo, registrationLayouts, RegistrationType } from "../shared/registrationLayouts";
import { getSupabasePool, PortalIdentity } from "./supabasePortal";

export type ImportRow = Record<string, string>;
export type ImportIssue = { row: number; field: string; message: string };

const allowedProfileKeys = new Set(["operations-admin", "manager", "operator", "viewer"]);
const productCategories: Record<string, "consumable" | "epi" | "uniform" | "tool" | "other"> = { consumivel: "consumable", "consumível": "consumable", consumable: "consumable", epi: "epi", uniforme: "uniform", uniform: "uniform", ferramenta: "tool", tool: "tool", outro: "other", other: "other" };

function parseProductCategory(value: string) {
  return productCategories[value.trim().toLowerCase()] ?? null;
}

export function registrationValidationMessage(source: "spreadsheet" | "direct" | "protheus", issues: ImportIssue[]) {
  if (source === "spreadsheet") return "A planilha contém erros. Corrija-os antes de importar.";
  const details = issues.slice(0, 3).map(issue => `${issue.field}: ${issue.message}`).join(" ");
  return `Corrija o cadastro antes de salvar. ${details}`;
}

function normalizeRows(type: RegistrationType, rows: ImportRow[]) {
  const layout = registrationLayouts[type];
  return rows.map(row => Object.fromEntries(layout.columns.map(column => [column.key, normalizeCell(row[column.key])])));
}

export function validateRegistrationRows(type: RegistrationType, rawRows: ImportRow[]) {
  const layout = registrationLayouts[type];
  const rows = normalizeRows(type, rawRows).filter(row => Object.values(row).some(Boolean));
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    layout.columns.filter(column => column.required && !row[column.key]).forEach(column => issues.push({ row: rowNumber, field: column.label, message: "Campo obrigatório não preenchido." }));
    if (row.email && !/^\S+@\S+\.\S+$/.test(row.email)) issues.push({ row: rowNumber, field: "E-mail", message: "Informe um e-mail válido." });
    if (row.ativo && !parseActive(row.ativo).valid) issues.push({ row: rowNumber, field: "Ativo", message: "Use SIM ou NÃO." });
    if (type === "employees") {
      if (row.requisitante_almoxarifado && !parseYesNo(row.requisitante_almoxarifado).valid) issues.push({ row: rowNumber, field: "Pode requisitar almoxarifado", message: "Use SIM ou NÃO." });
      if (row.data_admissao && !/^\d{4}-\d{2}-\d{2}$/.test(row.data_admissao)) issues.push({ row: rowNumber, field: "Data de admissão", message: "Use o formato AAAA-MM-DD." });
    }
    if (type === "users" && row.perfil && !allowedProfileKeys.has(row.perfil)) issues.push({ row: rowNumber, field: "Perfil", message: "Use operations-admin, manager, operator ou viewer." });
    if (type === "products") {
      if (row.categoria_operacional && !parseProductCategory(row.categoria_operacional)) issues.push({ row: rowNumber, field: "Categoria operacional", message: "Use consumível, EPI, uniforme, ferramenta ou outro." });
      (["controla_tamanho", "controla_lote", "controla_validade", "controla_ca"] as const).forEach(field => { if (!parseYesNo(row[field]).valid) issues.push({ row: rowNumber, field, message: "Use SIM ou NÃO." }); });
    }
    const uniqueKey = type === "users" ? row.email.toLowerCase() : type === "employees" ? row.codigo_funcionario : type === "suppliers" ? `${row.codigo_fornecedor}|${row.loja_fornecedor}` : row.codigo_produto;
    if (uniqueKey && seen.has(uniqueKey)) issues.push({ row: rowNumber, field: "Código ou e-mail", message: "Valor duplicado dentro da planilha." });
    if (uniqueKey) seen.add(uniqueKey);
  });
  return { rows, issues, totalRows: rows.length, valid: issues.length === 0 };
}

async function resolveReference(client: PoolClient, table: "org_units" | "cost_centers", code: string) {
  if (!code) return null;
  const result = await client.query<{ id: string }>(`select id from public.${table} where code = $1 and active = true limit 1`, [code]);
  return result.rows[0]?.id ?? null;
}

async function resolveProductType(client: PoolClient, code: string) {
  const result = await client.query<{ id: string; name: string }>("select id, name from public.product_types where code = $1 and active = true limit 1", [code]);
  return result.rows[0] ?? null;
}

async function resolveCompany(client: PoolClient, code: string) {
  if (!code) return null;
  const result = await client.query<{ id: string }>("select id from public.companies where code = $1 and active = true limit 1", [code]);
  return result.rows[0]?.id ?? null;
}

async function resolveBranch(client: PoolClient, companyCode: string, branchCode: string) {
  if (!branchCode) return null;
  const result = await client.query<{ id: string }>("select branch.id from public.branches branch join public.companies company on company.id = branch.company_id where company.code = $1 and branch.code = $2 and company.active and branch.active limit 1", [companyCode, branchCode]);
  return result.rows[0]?.id ?? null;
}

async function resolveManager(client: PoolClient, code: string) {
  if (!code) return null;
  const result = await client.query<{ id: string }>("select id from public.employees where employee_code = $1 and active = true limit 1", [code]);
  return result.rows[0]?.id ?? null;
}

async function validateReferences(type: RegistrationType, rows: ImportRow[]) {
  const client = await getSupabasePool().connect();
  try {
    const issues: ImportIssue[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (type === "employees") {
        if (row.codigo_unidade && !(await resolveReference(client, "org_units", row.codigo_unidade))) issues.push({ row: index + 2, field: "Código da unidade", message: "Unidade ativa não encontrada." });
        if (row.codigo_centro_custo && !(await resolveReference(client, "cost_centers", row.codigo_centro_custo))) issues.push({ row: index + 2, field: "Código do centro de custo", message: "Centro de custo ativo não encontrado." });
        if (row.codigo_empresa && !(await resolveCompany(client, row.codigo_empresa))) issues.push({ row: index + 2, field: "Código da empresa", message: "Empresa ativa não encontrada." });
        if (row.codigo_filial && !row.codigo_empresa) issues.push({ row: index + 2, field: "Código da filial", message: "Informe também o código da empresa." });
        if (row.codigo_filial && row.codigo_empresa && !(await resolveBranch(client, row.codigo_empresa, row.codigo_filial))) issues.push({ row: index + 2, field: "Código da filial", message: "Filial ativa não encontrada na empresa informada." });
        if (row.codigo_gestor && row.codigo_gestor === row.codigo_funcionario) issues.push({ row: index + 2, field: "Código do gestor", message: "O funcionário não pode ser seu próprio gestor." });
        if (row.codigo_gestor && !(await resolveManager(client, row.codigo_gestor))) issues.push({ row: index + 2, field: "Código do gestor", message: "Gestor ativo não encontrado." });
        if (row.email) {
          const existing = await client.query<{ employee_code: string }>("select employee_code from public.employees where lower(email) = lower($1) and employee_code <> $2", [row.email, row.codigo_funcionario]);
          if (existing.rows[0]) issues.push({ row: index + 2, field: "E-mail", message: "Este e-mail já pertence a outro código de funcionário." });
        }
      }
      if (type === "products" && !(await resolveProductType(client, row.codigo_tipo_produto))) issues.push({ row: index + 2, field: "Código do tipo de produto", message: "Tipo de produto ativo não encontrado." });
      if (type === "users") {
        const existing = await client.query<{ is_development_admin: boolean }>("select is_development_admin from public.portal_users where lower(email) = lower($1)", [row.email]);
        if (existing.rows[0]?.is_development_admin) issues.push({ row: index + 2, field: "E-mail", message: "O administrador técnico não pode ser alterado por planilha." });
      }
    }
    return issues;
  } finally { client.release(); }
}

export async function previewRegistrationImport(type: RegistrationType, rawRows: ImportRow[]) {
  const result = validateRegistrationRows(type, rawRows);
  const referenceIssues = result.issues.length ? [] : await validateReferences(type, result.rows);
  return { valid: result.valid && referenceIssues.length === 0, totalRows: result.totalRows, rows: result.rows, issues: [...result.issues, ...referenceIssues] };
}

export async function commitRegistrationImport(type: RegistrationType, rawRows: ImportRow[], actor: PortalIdentity, source: "spreadsheet" | "direct" | "protheus" = "spreadsheet") {
  const preview = await previewRegistrationImport(type, rawRows);
  if (!preview.valid) {
    throw new TRPCError({ code: "BAD_REQUEST", message: registrationValidationMessage(source, preview.issues) });
  }
  const client = await getSupabasePool().connect();
  try {
    await client.query("begin");
    for (const row of preview.rows) {
      const active = parseActive(row.ativo).value;
      if (type === "employees") {
        const unitId = await resolveReference(client, "org_units", row.codigo_unidade);
        const costCenterId = await resolveReference(client, "cost_centers", row.codigo_centro_custo);
        const companyId = await resolveCompany(client, row.codigo_empresa);
        const branchId = await resolveBranch(client, row.codigo_empresa, row.codigo_filial);
        const managerId = await resolveManager(client, row.codigo_gestor);
        await client.query(`insert into public.employees (employee_code, full_name, email, company_id, branch_id, unit_id, cost_center_id, department, job_title, manager_employee_id, admission_date, is_inventory_requester, active)
          values ($1, $2, nullif($3, ''), $4, $5, $6, $7, nullif($8, ''), nullif($9, ''), $10, nullif($11, '')::date, $12, $13)
          on conflict (employee_code) do update set full_name = excluded.full_name, email = excluded.email, company_id = excluded.company_id, branch_id = excluded.branch_id, unit_id = excluded.unit_id, cost_center_id = excluded.cost_center_id, department = excluded.department, job_title = excluded.job_title, manager_employee_id = excluded.manager_employee_id, admission_date = excluded.admission_date, is_inventory_requester = excluded.is_inventory_requester, active = excluded.active, updated_at = now()`, [row.codigo_funcionario, row.nome_completo, row.email, companyId, branchId, unitId, costCenterId, row.departamento, row.cargo, managerId, row.data_admissao, parseYesNo(row.requisitante_almoxarifado).value, active]);
      }
      if (type === "suppliers") await client.query(`insert into public.suppliers (supplier_code, store_code, legal_name, trade_name, document_number, active)
        values ($1, $2, $3, nullif($4, ''), nullif($5, ''), $6)
        on conflict (supplier_code, store_code) do update set legal_name = excluded.legal_name, trade_name = excluded.trade_name, document_number = excluded.document_number, active = excluded.active, updated_at = now()`, [row.codigo_fornecedor, row.loja_fornecedor, row.razao_social, row.nome_fantasia, row.cnpj_cpf, active]);
      if (type === "products") {
        const productType = await resolveProductType(client, row.codigo_tipo_produto);
        const category = parseProductCategory(row.categoria_operacional);
        if (!productType || !category) throw new TRPCError({ code: "BAD_REQUEST", message: "Revise o tipo e a categoria operacional do produto." });
        await client.query(`insert into public.products (product_code, name, product_type, product_type_id, inventory_control_category, unit_of_measure, requires_size, requires_lot, requires_expiration, requires_ca, active)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          on conflict (product_code) do update set name = excluded.name, product_type = excluded.product_type, product_type_id = excluded.product_type_id, inventory_control_category = excluded.inventory_control_category, unit_of_measure = excluded.unit_of_measure, requires_size = excluded.requires_size, requires_lot = excluded.requires_lot, requires_expiration = excluded.requires_expiration, requires_ca = excluded.requires_ca, active = excluded.active, updated_at = now()`, [row.codigo_produto, row.nome_produto, productType.name, productType.id, category, row.unidade_medida.toUpperCase(), parseYesNo(row.controla_tamanho).value, parseYesNo(row.controla_lote).value, parseYesNo(row.controla_validade).value, parseYesNo(row.controla_ca).value, active]);
      }
      if (type === "users") {
        const portalUser = await client.query<{ id: string }>(`insert into public.portal_users (email, display_name, status)
          values ($1, $2, $3)
          on conflict (email) do update set display_name = excluded.display_name, status = excluded.status, updated_at = now()
          returning id`, [row.email.toLowerCase(), row.nome, active ? "pending" : "inactive"]);
        const profile = await client.query<{ id: string }>("select id from public.access_profiles where profile_key = $1 and active = true", [row.perfil]);
        if (!profile.rows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Perfil informado não está disponível." });
        await client.query("delete from public.user_profile_assignments where user_id = $1", [portalUser.rows[0].id]);
        await client.query("insert into public.user_profile_assignments (user_id, profile_id, assigned_by_user_id) values ($1, $2, $3)", [portalUser.rows[0].id, profile.rows[0].id, actor.id]);
      }
    }
    await client.query("insert into public.audit_events (actor_user_id, entity_type, action, details) values ($1, $2, $3, jsonb_build_object('rows', $4::int))", [actor.id, type, source === "direct" ? "direct_saved" : source === "protheus" ? "protheus_imported" : "spreadsheet_imported", preview.totalRows]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  return { success: true as const, importedRows: preview.totalRows };
}

export async function listRegistrationRecords(type: RegistrationType) {
  const database = getSupabasePool();
  if (type === "employees") {
    const result = await database.query(`select employee.employee_code as code, employee.full_name as name, employee.email, company.code as codigo_empresa, branch.code as codigo_filial, unit.code as codigo_unidade, cost_center.code as codigo_centro_custo, employee.department as departamento, employee.job_title as cargo, manager.employee_code as codigo_gestor, employee.admission_date as data_admissao, employee.is_inventory_requester as requisitante_almoxarifado, employee.active, employee.updated_at as updated_at
      from public.employees employee left join public.companies company on company.id = employee.company_id left join public.branches branch on branch.id = employee.branch_id left join public.org_units unit on unit.id = employee.unit_id left join public.cost_centers cost_center on cost_center.id = employee.cost_center_id left join public.employees manager on manager.id = employee.manager_employee_id order by employee.full_name limit 200`);
    return result.rows;
  }
  if (type === "suppliers") {
    const result = await database.query("select supplier_code as code, store_code as loja_fornecedor, legal_name as name, trade_name as nome_fantasia, document_number as cnpj_cpf, active, updated_at as updated_at from public.suppliers order by supplier_code, store_code, legal_name limit 200");
    return result.rows;
  }
  if (type === "products") {
    const result = await database.query("select product.product_code as code, product.name, product.product_type as tipo_produto, product_type.code as codigo_tipo_produto, product.product_type_id, product.inventory_control_category, product.unit_of_measure, product.requires_size, product.requires_lot, product.requires_expiration, product.requires_ca, product.active, product.updated_at as updated_at from public.products product left join public.product_types product_type on product_type.id = product.product_type_id order by product.name limit 200");
    return result.rows;
  }
  const result = await database.query(`select user_record.email as code, user_record.display_name as name, user_record.status as secondary, user_record.status = 'active' as active,
    coalesce((select profile.profile_key from public.user_profile_assignments assignment join public.access_profiles profile on profile.id = assignment.profile_id where assignment.user_id = user_record.id limit 1), 'viewer') as perfil,
    user_record.updated_at as updated_at from public.portal_users user_record order by user_record.display_name nulls last limit 200`);
  return result.rows;
}

export async function setRegistrationRecordActive(type: RegistrationType, code: string, active: boolean, actor: PortalIdentity, storeCode?: string) {
  const database = getSupabasePool();
  let affected = 0;
  if (type === "employees") affected = (await database.query("update public.employees set active = $2, updated_at = now() where employee_code = $1", [code, active])).rowCount ?? 0;
  if (type === "suppliers") {
    if (!storeCode?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a loja para alterar o status do fornecedor." });
    affected = (await database.query("update public.suppliers set active = $3, updated_at = now() where supplier_code = $1 and store_code = $2", [code, storeCode, active])).rowCount ?? 0;
  }
  if (type === "products") affected = (await database.query("update public.products set active = $2, updated_at = now() where product_code = $1", [code, active])).rowCount ?? 0;
  if (type === "users") {
    const result = await database.query<{ is_development_admin: boolean }>("select is_development_admin from public.portal_users where email = $1", [code]);
    if (result.rows[0]?.is_development_admin) throw new TRPCError({ code: "FORBIDDEN", message: "O administrador técnico não pode ser inativado por este cadastro." });
    affected = (await database.query("update public.portal_users set status = $2, updated_at = now() where email = $1", [code, active ? "active" : "inactive"])).rowCount ?? 0;
  }
  if (!affected) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });
  await database.query("insert into public.audit_events (actor_user_id, entity_type, action, details) values ($1, $2, 'status_updated', jsonb_build_object('code', $3::text, 'store_code', $4::text, 'active', $5::boolean))", [actor.id, type, code, storeCode ?? null, active]);
  return { success: true as const, active };
}
