import { TRPCError } from "@trpc/server";
import { PoolClient } from "pg";
import { normalizeCell, parseActive, registrationLayouts, RegistrationType } from "../shared/registrationLayouts";
import { getSupabasePool, PortalIdentity } from "./supabasePortal";

export type ImportRow = Record<string, string>;
export type ImportIssue = { row: number; field: string; message: string };

const allowedProfileKeys = new Set(["operations-admin", "manager", "operator", "viewer"]);

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
    if (type === "users" && row.perfil && !allowedProfileKeys.has(row.perfil)) issues.push({ row: rowNumber, field: "Perfil", message: "Use operations-admin, manager, operator ou viewer." });
    const uniqueKey = type === "users" ? row.email.toLowerCase() : type === "employees" ? row.codigo_funcionario : type === "suppliers" ? row.codigo_fornecedor : row.codigo_produto;
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

async function validateReferences(type: RegistrationType, rows: ImportRow[]) {
  const client = await getSupabasePool().connect();
  try {
    const issues: ImportIssue[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (type === "employees") {
        if (row.codigo_unidade && !(await resolveReference(client, "org_units", row.codigo_unidade))) issues.push({ row: index + 2, field: "Código da unidade", message: "Unidade ativa não encontrada." });
        if (row.codigo_centro_custo && !(await resolveReference(client, "cost_centers", row.codigo_centro_custo))) issues.push({ row: index + 2, field: "Código do centro de custo", message: "Centro de custo ativo não encontrado." });
        if (row.email) {
          const existing = await client.query<{ employee_code: string }>("select employee_code from public.employees where lower(email) = lower($1) and employee_code <> $2", [row.email, row.codigo_funcionario]);
          if (existing.rows[0]) issues.push({ row: index + 2, field: "E-mail", message: "Este e-mail já pertence a outro código de funcionário." });
        }
      }
      if (type === "suppliers" && row.cnpj_cpf) {
        const existing = await client.query<{ supplier_code: string }>("select supplier_code from public.suppliers where document_number = $1 and supplier_code <> $2", [row.cnpj_cpf, row.codigo_fornecedor]);
        if (existing.rows[0]) issues.push({ row: index + 2, field: "CNPJ ou CPF", message: "Este documento já pertence a outro código de fornecedor." });
      }
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

export async function commitRegistrationImport(type: RegistrationType, rawRows: ImportRow[], actor: PortalIdentity) {
  const preview = await previewRegistrationImport(type, rawRows);
  if (!preview.valid) throw new TRPCError({ code: "BAD_REQUEST", message: "A planilha contém erros. Corrija-os antes de importar." });
  const client = await getSupabasePool().connect();
  try {
    await client.query("begin");
    for (const row of preview.rows) {
      const active = parseActive(row.ativo).value;
      if (type === "employees") {
        const unitId = await resolveReference(client, "org_units", row.codigo_unidade);
        const costCenterId = await resolveReference(client, "cost_centers", row.codigo_centro_custo);
        await client.query(`insert into public.employees (employee_code, full_name, email, unit_id, cost_center_id, active)
          values ($1, $2, nullif($3, ''), $4, $5, $6)
          on conflict (employee_code) do update set full_name = excluded.full_name, email = excluded.email, unit_id = excluded.unit_id, cost_center_id = excluded.cost_center_id, active = excluded.active, updated_at = now()`, [row.codigo_funcionario, row.nome_completo, row.email, unitId, costCenterId, active]);
      }
      if (type === "suppliers") await client.query(`insert into public.suppliers (supplier_code, legal_name, trade_name, document_number, active)
        values ($1, $2, nullif($3, ''), nullif($4, ''), $5)
        on conflict (supplier_code) do update set legal_name = excluded.legal_name, trade_name = excluded.trade_name, document_number = excluded.document_number, active = excluded.active, updated_at = now()`, [row.codigo_fornecedor, row.razao_social, row.nome_fantasia, row.cnpj_cpf, active]);
      if (type === "products") await client.query(`insert into public.products (product_code, name, product_type, active)
        values ($1, $2, nullif($3, ''), $4)
        on conflict (product_code) do update set name = excluded.name, product_type = excluded.product_type, active = excluded.active, updated_at = now()`, [row.codigo_produto, row.nome_produto, row.tipo_produto, active]);
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
    await client.query("insert into public.audit_events (actor_user_id, entity_type, action, details) values ($1, $2, 'spreadsheet_imported', jsonb_build_object('rows', $3::int))", [actor.id, type, preview.totalRows]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  return { success: true as const, importedRows: preview.totalRows };
}

export async function listRegistrationRecords(type: RegistrationType) {
  const database = getSupabasePool();
  if (type === "employees") {
    const result = await database.query(`select employee.employee_code as code, employee.full_name as name, employee.email, unit.code as codigo_unidade, cost_center.code as codigo_centro_custo, employee.active, employee.updated_at as updated_at
      from public.employees employee left join public.org_units unit on unit.id = employee.unit_id left join public.cost_centers cost_center on cost_center.id = employee.cost_center_id order by employee.full_name limit 200`);
    return result.rows;
  }
  if (type === "suppliers") {
    const result = await database.query("select supplier_code as code, legal_name as name, trade_name as nome_fantasia, document_number as cnpj_cpf, active, updated_at as updated_at from public.suppliers order by legal_name limit 200");
    return result.rows;
  }
  if (type === "products") {
    const result = await database.query("select product_code as code, name, product_type as tipo_produto, active, updated_at as updated_at from public.products order by name limit 200");
    return result.rows;
  }
  const result = await database.query(`select user_record.email as code, user_record.display_name as name, user_record.status as secondary, user_record.status = 'active' as active,
    coalesce((select profile.profile_key from public.user_profile_assignments assignment join public.access_profiles profile on profile.id = assignment.profile_id where assignment.user_id = user_record.id limit 1), 'viewer') as perfil,
    user_record.updated_at as updated_at from public.portal_users user_record order by user_record.display_name nulls last limit 200`);
  return result.rows;
}

export async function setRegistrationRecordActive(type: RegistrationType, code: string, active: boolean, actor: PortalIdentity) {
  const database = getSupabasePool();
  let affected = 0;
  if (type === "employees") affected = (await database.query("update public.employees set active = $2, updated_at = now() where employee_code = $1", [code, active])).rowCount ?? 0;
  if (type === "suppliers") affected = (await database.query("update public.suppliers set active = $2, updated_at = now() where supplier_code = $1", [code, active])).rowCount ?? 0;
  if (type === "products") affected = (await database.query("update public.products set active = $2, updated_at = now() where product_code = $1", [code, active])).rowCount ?? 0;
  if (type === "users") {
    const result = await database.query<{ is_development_admin: boolean }>("select is_development_admin from public.portal_users where email = $1", [code]);
    if (result.rows[0]?.is_development_admin) throw new TRPCError({ code: "FORBIDDEN", message: "O administrador técnico não pode ser inativado por este cadastro." });
    affected = (await database.query("update public.portal_users set status = $2, updated_at = now() where email = $1", [code, active ? "active" : "inactive"])).rowCount ?? 0;
  }
  if (!affected) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });
  await database.query("insert into public.audit_events (actor_user_id, entity_type, action, details) values ($1, $2, 'status_updated', jsonb_build_object('code', $3::text, 'active', $4::boolean))", [actor.id, type, code, active]);
  return { success: true as const, active };
}
