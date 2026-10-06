import { TRPCError } from "@trpc/server";
import { Pool } from "pg";
import { authenticatePortalSession } from "./portalAuthService";

type ApplicationNodeRow = { id: string; node_key: string; label: string; parent_id: string | null; sort_order: number };
type PortalUserRow = { id: string; auth_user_id: string | null; employee_id: string | null; email: string; display_name: string | null; status: "pending" | "active" | "inactive"; is_development_admin: boolean; can_fulfill_inventory_requests: boolean; profile_keys: string[] | null; profile_key?: string | null; own_password_configured?: boolean };
type ProfileRow = { id: string; profile_key: string; name: string; description: string | null };
type RequestRow = { id: string; requested_email: string; status: "pending" | "approved" | "rejected" | "cancelled"; reason: string | null; created_at: Date; display_name: string | null; active_user_exists?: boolean };
type Permission = "view" | "manage" | "approve";
type PermissionNodeRow = ApplicationNodeRow & { view: boolean; manage: boolean; approve: boolean };

const profileOrder = ["development-admin", "operations-admin", "manager", "operator", "viewer"];

export function normalizeProfileKeys(keys: string[]) {
  return Array.from(new Set(keys.filter(Boolean))).sort((a, b) => {
    const ai = profileOrder.indexOf(a);
    const bi = profileOrder.indexOf(b);
    return (ai < 0 ? profileOrder.length : ai) - (bi < 0 ? profileOrder.length : bi) || a.localeCompare(b);
  });
}

export type ApplicationTreeNode = { id: string; key: string; label: string; children: ApplicationTreeNode[] };
export type PortalIdentity = { id: string; email: string; displayName: string | null; isDevelopmentAdmin: boolean; profiles: string[] };

let pool: Pool | null = null;

export function getSupabasePool() {
  if (!pool) {
    const connectionString = process.env.PORTAL_DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL;
    if (!connectionString) throw new Error("A conexão do banco do portal não está configurada.");
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
    pool.on('error', (err) => {
      console.error('[PortalDatabase] Unexpected error on idle client:', err);
    });
  }
  return pool;
}

function getAccessToken(authorizationHeader?: string) {
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new TRPCError({ code: "UNAUTHORIZED", message: "Autenticação do portal necessária." });
  return match[1];
}

function serviceConfig() {
  const projectUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!projectUrl || !serviceRoleKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Integração de identidade incompleta." });
  return { projectUrl, serviceRoleKey };
}

async function getSupabaseAuthUser(authorizationHeader?: string) {
  const token = getAccessToken(authorizationHeader);
  const projectUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!projectUrl || !anonKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Integração Supabase incompleta." });
  const response = await fetch(`${projectUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão do portal inválida ou expirada." });
  return response.json() as Promise<{ id: string; email?: string }>;
}

export async function getPortalIdentity(authorizationHeader?: string): Promise<PortalIdentity> {
  const ownSession = authorizationHeader?.match(/^PortalSession\s+(.+)$/i);
  if (ownSession) {
    const identity = await authenticatePortalSession(ownSession[1]);
    if (!identity) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão do portal inválida ou expirada." });
    return identity;
  }
  const authUser = await getSupabaseAuthUser(authorizationHeader);
  const result = await getSupabasePool().query<PortalUserRow>(
    `select u.id, u.email, u.display_name, u.is_development_admin,
       coalesce(array_agg(p.profile_key) filter (where p.profile_key is not null), '{}') as profile_keys
     from public.portal_users u
     left join public.user_profile_assignments assignment on assignment.user_id = u.id
     left join public.access_profiles p on p.id = assignment.profile_id
     where u.auth_user_id = $1 and u.status = 'active'
     group by u.id`,
    [authUser.id],
  );
  const row = result.rows[0];
  if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "Seu usuário não foi liberado para o portal." });
  return { id: row.id, email: row.email, displayName: row.display_name, isDevelopmentAdmin: row.is_development_admin, profiles: normalizeProfileKeys(row.profile_keys ?? []) };
}

export async function recordPortalAudit(actor: PortalIdentity, entityType: string, entityId: string, action: string, details: Record<string, unknown> = {}) {
  await getSupabasePool().query("insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details) values ($1, $2, $3, $4, $5::jsonb)", [actor.id, entityType, entityId, action, JSON.stringify(details)]);
}

export function assertPortalAdministrator(identity: PortalIdentity) {
  if (!identity.isDevelopmentAdmin && !identity.profiles.includes("operations-admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem gerenciar usuários." });
  }
}

export async function applicationPermissionsForUser(identity: PortalIdentity, nodeKey: string) {
  if (identity.isDevelopmentAdmin) {
    return { view: true, manage: true, approve: true };
  }
  const result = await getSupabasePool().query<{ permission: Permission; allowed: boolean }>(
    `select operation.permission, coalesce(
       (select user_permission.allowed from public.user_node_permissions user_permission join public.application_nodes node on node.id = user_permission.node_id where user_permission.user_id = $1 and node.node_key = $2 and user_permission.permission = operation.permission),
       exists(select 1 from public.user_profile_assignments assignment join public.profile_node_permissions profile_permission on profile_permission.profile_id = assignment.profile_id join public.application_nodes node on node.id = profile_permission.node_id where assignment.user_id = $1 and node.node_key = $2 and profile_permission.permission = operation.permission)
     ) as allowed
     from (values ('view'::text), ('manage'::text), ('approve'::text)) as operation(permission)`, [identity.id, nodeKey],
  );
  return result.rows.reduce((permissions, row) => ({ ...permissions, [row.permission]: row.allowed }), { view: false, manage: false, approve: false });
}

export async function assertApplicationPermission(identity: PortalIdentity, nodeKey: string, permission: Permission) {
  const permissions = await applicationPermissionsForUser(identity, nodeKey);
  if (!permissions[permission]) throw new TRPCError({ code: "FORBIDDEN", message: "Seu usuário não possui o nível de acesso necessário neste módulo." });
  return true;
}

export function buildApplicationTree(rows: ApplicationNodeRow[]): ApplicationTreeNode[] {
  const mapped = new Map<string, ApplicationTreeNode>();
  const roots: ApplicationTreeNode[] = [];
  rows.forEach(row => mapped.set(row.id, { id: row.id, key: row.node_key, label: row.label, children: [] }));
  rows.forEach(row => { const node = mapped.get(row.id)!; if (!row.parent_id) roots.push(node); else mapped.get(row.parent_id)?.children.push(node); });
  return roots;
}

function keepAllowedBranches(nodes: ApplicationTreeNode[], allowed: Set<string>): ApplicationTreeNode[] {
  return nodes.flatMap(node => {
    const children = keepAllowedBranches(node.children, allowed);
    return allowed.has(node.id) || children.length > 0 ? [{ ...node, children }] : [];
  });
}

export async function listApplicationTreeForUser(identity: PortalIdentity) {
  const result = await getSupabasePool().query<ApplicationNodeRow & { permitted: boolean }>(
    `select node.id, node.node_key, node.label, node.parent_id, node.sort_order,
       exists(select 1 from (values ('view'::text), ('manage'::text), ('approve'::text)) as operation(permission)
         where coalesce(
           (select user_permission.allowed from public.user_node_permissions user_permission where user_permission.user_id = $1 and user_permission.node_id = node.id and user_permission.permission = operation.permission),
           exists(select 1 from public.user_profile_assignments assignment join public.profile_node_permissions profile_permission on profile_permission.profile_id = assignment.profile_id where assignment.user_id = $1 and profile_permission.node_id = node.id and profile_permission.permission = operation.permission)
         )
       ) as permitted
     from public.application_nodes node
     where node.active = true
     order by node.sort_order, node.label`,
    [identity.id],
  );
  return keepAllowedBranches(buildApplicationTree(result.rows), new Set(result.rows.filter(row => row.permitted).map(row => row.id)));
}

export async function listAccessProfiles() {
  const result = await getSupabasePool().query<ProfileRow>("select id, profile_key, name, description from public.access_profiles where active = true order by name");
  return Array.from(new Map(result.rows.map(row => [row.profile_key, { id: row.id, key: row.profile_key, name: row.name, description: row.description }])).values()).sort((a, b) => { const ai = profileOrder.indexOf(a.key); const bi = profileOrder.indexOf(b.key); return (ai < 0 ? profileOrder.length : ai) - (bi < 0 ? profileOrder.length : bi) || a.name.localeCompare(b.name); });
}

async function listNodesWithPermissions(profileKey: string, userId?: string) {
  const database = getSupabasePool();
  const profile = await database.query<{ id: string }>("select id from public.access_profiles where profile_key = $1 and active = true", [profileKey]);
  if (!profile.rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Perfil não encontrado." });
  const result = await database.query<PermissionNodeRow>(
    `select node.id, node.node_key, node.label, node.parent_id, node.sort_order,
      exists(select 1 from public.profile_node_permissions permission where permission.profile_id = $1 and permission.node_id = node.id and permission.permission = 'view') as view,
      exists(select 1 from public.profile_node_permissions permission where permission.profile_id = $1 and permission.node_id = node.id and permission.permission = 'manage') as manage,
      exists(select 1 from public.profile_node_permissions permission where permission.profile_id = $1 and permission.node_id = node.id and permission.permission = 'approve') as approve
     from public.application_nodes node where node.active = true order by node.sort_order, node.label`, [profile.rows[0].id],
  );
  const overrides = userId ? await database.query<{ node_id: string; permission: Permission; allowed: boolean }>("select node_id, permission, allowed from public.user_node_permissions where user_id = $1", [userId]) : { rows: [] };
  const byNode = new Map<string, Map<Permission, boolean>>();
  overrides.rows.forEach(row => { const operations = byNode.get(row.node_id) ?? new Map<Permission, boolean>(); operations.set(row.permission, row.allowed); byNode.set(row.node_id, operations); });
  return result.rows.map(row => ({ id: row.id, key: row.node_key, label: row.label, parentId: row.parent_id, view: byNode.get(row.id)?.get("view") ?? row.view, manage: byNode.get(row.id)?.get("manage") ?? row.manage, approve: byNode.get(row.id)?.get("approve") ?? row.approve, overrides: userId ? { view: byNode.get(row.id)?.get("view") ?? null, manage: byNode.get(row.id)?.get("manage") ?? null, approve: byNode.get(row.id)?.get("approve") ?? null } : undefined }));
}

export async function listProfileNodePermissions(profileKey: string) { return listNodesWithPermissions(profileKey); }

export async function listUserNodePermissions(userId: string) {
  const profiles = await getSupabasePool().query<{ profile_key: string }>("select profile.profile_key from public.user_profile_assignments assignment join public.access_profiles profile on profile.id = assignment.profile_id where assignment.user_id = $1", [userId]);
  if (!profiles.rows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário sem perfil de acesso." });
  return listNodesWithPermissions(profiles.rows[0].profile_key, userId);
}

export async function updateProfileNodePermission(input: { profileKey: string; nodeId: string; permission: Permission; allowed: boolean }, actor: PortalIdentity) {
  const database = getSupabasePool();
  const profile = await database.query<{ id: string }>("select id from public.access_profiles where profile_key = $1 and active = true", [input.profileKey]);
  if (!profile.rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Perfil não encontrado." });
  if (input.profileKey === "development-admin" && !actor.isDevelopmentAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Somente o administrador técnico pode alterar este perfil." });
  if (input.allowed) await database.query("insert into public.profile_node_permissions (profile_id, node_id, permission) values ($1, $2, $3) on conflict do nothing", [profile.rows[0].id, input.nodeId, input.permission]);
  else await database.query("delete from public.profile_node_permissions where profile_id = $1 and node_id = $2 and permission = $3", [profile.rows[0].id, input.nodeId, input.permission]);
  return { success: true as const };
}

export async function updateUserNodePermission(input: { userId: string; nodeId: string; permission: Permission; allowed: boolean }, actor: PortalIdentity) {
  const database = getSupabasePool();
  const target = await database.query<{ is_development_admin: boolean }>("select is_development_admin from public.portal_users where id = $1", [input.userId]);
  if (!target.rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  if (target.rows[0].is_development_admin) throw new TRPCError({ code: "FORBIDDEN", message: "O administrador técnico não recebe exceções individuais." });
  await database.query(`insert into public.user_node_permissions (user_id, node_id, permission, allowed, updated_by_user_id)
    values ($1, $2, $3, $4, $5)
    on conflict (user_id, node_id, permission) do update set allowed = excluded.allowed, updated_by_user_id = excluded.updated_by_user_id, updated_at = now()`, [input.userId, input.nodeId, input.permission, input.allowed, actor.id]);
  return { success: true as const };
}

export async function listPortalUsers() {
  const result = await getSupabasePool().query<PortalUserRow>(
    `select u.id, u.auth_user_id, u.employee_id, u.email, u.display_name, u.status, u.is_development_admin, u.can_fulfill_inventory_requests,
       (u.password_hash is not null) as own_password_configured,
       coalesce(array_agg(p.profile_key) filter (where p.profile_key is not null), '{}') as profile_keys
     from public.portal_users u
     left join public.user_profile_assignments assignment on assignment.user_id = u.id
     left join public.access_profiles p on p.id = assignment.profile_id
     group by u.id
     order by u.created_at asc`,
  );
  return result.rows.map(row => ({ id: row.id, authUserId: row.auth_user_id, employeeId: row.employee_id, email: row.email, displayName: row.display_name, status: row.status, isDevelopmentAdmin: row.is_development_admin, canFulfillInventoryRequests: row.can_fulfill_inventory_requests, activation: row.own_password_configured ? "confirmed" : "pending", profiles: normalizeProfileKeys(row.profile_keys ?? []) }));
}

export async function listActiveEmployees() {
  const result = await getSupabasePool().query<{ id: string; employee_code: string | null; full_name: string; is_inventory_requester: boolean }>("select id, employee_code, full_name, is_inventory_requester from public.employees where active = true order by full_name");
  return result.rows.map(row => ({ id: row.id, canRequestInventory: row.is_inventory_requester, label: `${row.employee_code ? `${row.employee_code} · ` : ""}${row.full_name}${row.is_inventory_requester ? " · requisitante" : " · não requisitante"}` }));
}

export const OPERATIONAL_PRIVILEGES = [
  "receipts.capture",
  "receipts.consult",
  "receipts.redespacho.approve",
  "receipts.redespacho.confirm_destination",
] as const;
export type OperationalPrivilege = (typeof OPERATIONAL_PRIVILEGES)[number];

export async function listActiveBranches() {
  const result = await getSupabasePool().query<{ id: string; code: string; name: string; company_name: string }>(
    `select branch.id, branch.code, branch.name, company.legal_name as company_name
       from public.branches branch
       join public.companies company on company.id = branch.company_id
      where branch.active = true and company.active = true
      order by branch.code, branch.name`,
  );
  return result.rows.map(row => ({ id: row.id, code: row.code, name: row.name, companyName: row.company_name, label: `${row.code} · ${row.name}` }));
}

export async function listUserOperationalScope(userId: string) {
  const database = getSupabasePool();
  const branches = await database.query<{ branch_id: string; is_default: boolean }>(
    "select branch_id, is_default from public.portal_user_branch_access where user_id = $1 and active = true order by is_default desc, branch_id",
    [userId],
  );
  const privileges = await database.query<{ privilege_key: OperationalPrivilege }>(
    "select privilege_key from public.portal_user_operational_privileges where user_id = $1 and allowed = true order by privilege_key",
    [userId],
  );
  return {
    branchIds: branches.rows.map(row => row.branch_id),
    defaultBranchId: branches.rows.find(row => row.is_default)?.branch_id ?? null,
    privileges: privileges.rows.map(row => row.privilege_key),
  };
}

export async function updateUserOperationalScope(input: { userId: string; branchIds: string[]; defaultBranchId: string | null; privileges: OperationalPrivilege[] }, actor: PortalIdentity) {
  const database = getSupabasePool();
  const user = await database.query<{ id: string }>("select id from public.portal_users where id = $1", [input.userId]);
  if (!user.rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  const branchIds = Array.from(new Set(input.branchIds));
  if (input.defaultBranchId && !branchIds.includes(input.defaultBranchId)) throw new TRPCError({ code: "BAD_REQUEST", message: "A filial padrão deve estar entre as filiais autorizadas." });
  if (branchIds.length) {
    const validBranches = await database.query<{ id: string }>("select id from public.branches where id = any($1::uuid[]) and active = true", [branchIds]);
    if (validBranches.rows.length !== branchIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Uma ou mais filiais selecionadas estão inativas ou não existem." });
  }
  const privileges = Array.from(new Set(input.privileges));
  if (privileges.some(privilege => !(OPERATIONAL_PRIVILEGES as readonly string[]).includes(privilege))) throw new TRPCError({ code: "BAD_REQUEST", message: "Privilégio operacional inválido." });

  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query("delete from public.portal_user_branch_access where user_id = $1", [input.userId]);
    for (const branchId of branchIds) {
      await client.query("insert into public.portal_user_branch_access (user_id, branch_id, is_default, assigned_by_user_id) values ($1, $2, $3, $4)", [input.userId, branchId, input.defaultBranchId === branchId, actor.id]);
    }
    await client.query("delete from public.portal_user_operational_privileges where user_id = $1", [input.userId]);
    for (const privilege of privileges) {
      await client.query("insert into public.portal_user_operational_privileges (user_id, privilege_key, allowed, assigned_by_user_id) values ($1, $2, true, $3)", [input.userId, privilege, actor.id]);
    }
    await client.query("insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details) values ($1, 'portal_user', $2, 'operational_scope_updated', jsonb_build_object('branch_ids', $3::jsonb, 'default_branch_id', $4::text, 'privileges', $5::jsonb))", [actor.id, input.userId, JSON.stringify(branchIds), input.defaultBranchId, JSON.stringify(privileges)]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return listUserOperationalScope(input.userId);
}

export async function createPortalUser(input: { email: string; displayName: string; profileKey: string }, actor: PortalIdentity) {
  const database = getSupabasePool();
  const portalUser = await database.query<{ id: string }>(
    `insert into public.portal_users (email, display_name, status)
     values ($1, $2, 'active')
     on conflict (email) do update set display_name = excluded.display_name, status = 'active', updated_at = now()
     returning id`,
    [input.email, input.displayName],
  );
  await assignProfile(portalUser.rows[0].id, input.profileKey, actor);
  await database.query("insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details) values ($1, 'portal_user', $2, 'created', jsonb_build_object('email', $3::text))", [actor.id, portalUser.rows[0].id, input.email]);
  return { success: true } as const;
}

export async function assignProfile(userId: string, profileKey: string, actor: PortalIdentity) {
  const database = getSupabasePool();
  const profile = await database.query<ProfileRow>("select id, profile_key, name, description from public.access_profiles where profile_key = $1 and active = true", [profileKey]);
  if (!profile.rows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Perfil de acesso inválido." });
  await database.query("delete from public.user_profile_assignments where user_id = $1", [userId]);
  await database.query("insert into public.user_profile_assignments (user_id, profile_id, assigned_by_user_id) values ($1, $2, $3)", [userId, profile.rows[0].id, actor.id]);
  await database.query("insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details) values ($1, 'portal_user', $2, 'profile_assigned', jsonb_build_object('profile', $3::text))", [actor.id, userId, profileKey]);
}

export async function updatePortalUser(userId: string, input: { status: "active" | "inactive"; profileKey: string; canFulfillInventoryRequests?: boolean; employeeId?: string | null }, actor: PortalIdentity) {
  const database = getSupabasePool();
  if (input.employeeId) {
    const employee = await database.query<{ id: string }>("select id from public.employees where id = $1 and active = true", [input.employeeId]);
    if (!employee.rows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione um funcionário ativo para o vínculo operacional." });
  }
  const hasEmployeeChange = Object.prototype.hasOwnProperty.call(input, "employeeId");
  await database.query("update public.portal_users set status = $2, can_fulfill_inventory_requests = coalesce($3, can_fulfill_inventory_requests), employee_id = case when $4::boolean then $5::uuid else employee_id end, updated_at = now() where id = $1", [userId, input.status, input.canFulfillInventoryRequests ?? null, hasEmployeeChange, input.employeeId ?? null]);
  await database.query("insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details) values ($1, 'portal_user', $2, 'updated', jsonb_build_object('employee_link_changed', $3::boolean))", [actor.id, userId, hasEmployeeChange]);
  await assignProfile(userId, input.profileKey, actor);
  return { success: true } as const;
}

export async function resendInvite(email: string) {
  const { projectUrl, serviceRoleKey } = serviceConfig();
  const portalUrl = process.env.VITE_SUPABASE_URL?.replace(".supabase.co", "") || "https://portal-operacoes-megatec.duckdns.org";
  const response = await fetch(`${projectUrl}/auth/v1/recover`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, redirect_to: "https://portal-operacoes-megatec.duckdns.org" }),
  });
  if (!response.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível enviar a redefinição de senha." });
  return { success: true } as const;
}

export async function resendActivationInvite(userId: string) {
  const database = getSupabasePool();
  const result = await database.query<{ email: string; display_name: string | null; password_hash: string | null }>(
    "select email, display_name, password_hash from public.portal_users where id = $1",
    [userId],
  );
  const user = result.rows[0];
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  // REGRA: a ativação agora é a senha própria, provisionada pelo administrador
  // por procedimento seguro na VM; o convite por e-mail do Supabase foi descontinuado.
  if (user.password_hash) throw new TRPCError({ code: "BAD_REQUEST", message: "Este usuário já possui senha própria configurada." });
  throw new TRPCError({ code: "BAD_REQUEST", message: `Provisione a senha inicial de ${user.email} pelo procedimento seguro na VM; o envio de convite por e-mail foi descontinuado.` });
}

export async function createAccessRequest(input: { email: string; displayName: string; reason?: string }) {
  const database = getSupabasePool();
  const existing = await database.query<{ active_user_exists: boolean; pending_request_exists: boolean }>(
    `select
       exists(select 1 from public.portal_users where lower(email) = lower($1) and status = 'active') as active_user_exists,
       exists(select 1 from public.user_access_requests where lower(requested_email) = lower($1) and status = 'pending') as pending_request_exists`,
    [input.email],
  );
  if (existing.rows[0]?.active_user_exists) throw new TRPCError({ code: "BAD_REQUEST", message: "Este e-mail já possui acesso ativo ao portal." });
  if (existing.rows[0]?.pending_request_exists) throw new TRPCError({ code: "BAD_REQUEST", message: "Já existe uma solicitação pendente para este e-mail." });
  await database.query(
    `insert into public.user_access_requests (requested_email, reason)
     values ($1, $2)`,
    [input.email, input.reason ?? null],
  );
  await database.query("insert into public.audit_events (entity_type, action, details) values ('access_request', 'requested', jsonb_build_object('display_name', $1::text, 'email', $2::text))", [input.displayName, input.email]);
  return { success: true } as const;
}

export async function listAccessRequests() {
  const result = await getSupabasePool().query<RequestRow>(
    `select request.id, request.requested_email, request.status, request.reason, request.created_at, null::text as display_name,
       exists(select 1 from public.portal_users user_record where lower(user_record.email) = lower(request.requested_email) and user_record.status = 'active') as active_user_exists
     from public.user_access_requests request
     order by request.created_at desc`,
  );
  return result.rows.map(row => ({ id: row.id, email: row.requested_email, status: row.status, reason: row.reason, createdAt: row.created_at, userAlreadyActive: row.active_user_exists ?? false }));
}

export async function reviewAccessRequest(input: { requestId: string; decision: "approved" | "rejected"; profileKey?: string; displayName?: string }, actor: PortalIdentity) {
  const database = getSupabasePool();
  const request = await database.query<RequestRow>("select id, requested_email, status, reason, created_at, null::text as display_name from public.user_access_requests where id = $1", [input.requestId]);
  const current = request.rows[0];
  if (!current || current.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Solicitação indisponível para revisão." });
  if (input.decision === "approved") {
    if (!input.profileKey || !input.displayName) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o nome e perfil para aprovar a solicitação." });
    const existingActiveUser = await database.query<{ id: string }>("select id from public.portal_users where lower(email) = lower($1) and status = 'active' limit 1", [current.requested_email]);
    if (existingActiveUser.rows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Este e-mail já possui acesso ativo. Arquive a solicitação duplicada sem aprová-la." });
    await createPortalUser({ email: current.requested_email, displayName: input.displayName, profileKey: input.profileKey }, actor);
  }
  await database.query("update public.user_access_requests set status = $2, reviewed_by_user_id = $3, reviewed_at = now(), updated_at = now() where id = $1", [input.requestId, input.decision, actor.id]);
  return { success: true } as const;
}
export async function upsertObservacao(input: { codigo: string; filial: string; period: string; observacao: string | null }, actor: PortalIdentity) {
  const database = getSupabasePool();
  await database.query(
    `insert into public.observacoes (codigo, filial, period, observacao, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (codigo, filial, period)
     do update set observacao = excluded.observacao, updated_at = now()`,
    [input.codigo, input.filial, input.period, input.observacao],
  );
  await database.query(
    `insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details)
     values ($1, 'observacao', $2, 'upserted', jsonb_build_object('codigo', $3::text, 'filial', $4::text, 'period', $5::text))`,
    [actor.id, `${input.codigo}-${input.filial}-${input.period}`, input.codigo, input.filial, input.period],
  );
  return { success: true as const };
}

export async function listObservacoes(period: string, actor: PortalIdentity) {
  const result = await getSupabasePool().query<{ codigo: string; filial: string; period: string; observacao: string | null }>(
    `select codigo, filial, period, observacao from public.observacoes where period = $1`,
    [period],
  );
  return result.rows;
}
