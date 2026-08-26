import { TRPCError } from "@trpc/server";
import { Pool } from "pg";

type ApplicationNodeRow = { id: string; node_key: string; label: string; parent_id: string | null; sort_order: number };
type PortalUserRow = { id: string; auth_user_id: string | null; email: string; display_name: string | null; status: "pending" | "active" | "inactive"; is_development_admin: boolean; profile_keys: string[] | null; profile_key?: string | null; email_confirmed_at?: Date | null };
type ProfileRow = { id: string; profile_key: string; name: string; description: string | null };
type RequestRow = { id: string; requested_email: string; status: "pending" | "approved" | "rejected" | "cancelled"; reason: string | null; created_at: Date; display_name: string | null; active_user_exists?: boolean };
type Permission = "view" | "manage" | "approve";
type PermissionNodeRow = ApplicationNodeRow & { view: boolean; manage: boolean; approve: boolean };

export type ApplicationTreeNode = { id: string; key: string; label: string; children: ApplicationTreeNode[] };
export type PortalIdentity = { id: string; email: string; displayName: string | null; isDevelopmentAdmin: boolean; profiles: string[] };

let pool: Pool | null = null;

export function getSupabasePool() {
  if (!pool) {
    const connectionString = process.env.SUPABASE_DATABASE_URL;
    if (!connectionString) throw new Error("A conexão externa com o Supabase não está configurada.");
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 4 });
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
  return { id: row.id, email: row.email, displayName: row.display_name, isDevelopmentAdmin: row.is_development_admin, profiles: row.profile_keys ?? [] };
}

export function assertPortalAdministrator(identity: PortalIdentity) {
  if (!identity.isDevelopmentAdmin && !identity.profiles.includes("operations-admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem gerenciar usuários." });
  }
}

export async function applicationPermissionsForUser(identity: PortalIdentity, nodeKey: string) {
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
  return result.rows.map(row => ({ id: row.id, key: row.profile_key, name: row.name, description: row.description }));
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
    `select u.id, u.auth_user_id, u.email, u.display_name, u.status, u.is_development_admin, auth.email_confirmed_at,
       coalesce(array_agg(p.profile_key) filter (where p.profile_key is not null), '{}') as profile_keys
     from public.portal_users u
     left join auth.users auth on auth.id = u.auth_user_id
     left join public.user_profile_assignments assignment on assignment.user_id = u.id
     left join public.access_profiles p on p.id = assignment.profile_id
     group by u.id, auth.email_confirmed_at
     order by u.created_at asc`,
  );
  return result.rows.map(row => ({ id: row.id, authUserId: row.auth_user_id, email: row.email, displayName: row.display_name, status: row.status, isDevelopmentAdmin: row.is_development_admin, activation: row.email_confirmed_at ? "confirmed" : "pending", profiles: row.profile_keys ?? [] }));
}

async function ensureAuthInvitation(email: string, displayName: string) {
  const database = getSupabasePool();
  const existing = await database.query<{ id: string }>("select id from auth.users where lower(email) = lower($1) limit 1", [email]);
  if (existing.rows[0]) return existing.rows[0];
  const { projectUrl, serviceRoleKey } = serviceConfig();
  const response = await fetch(`${projectUrl}/auth/v1/invite`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, data: { display_name: displayName, portal_environment: "homologacao" } }),
  });
  const body = await response.json();
  if (!response.ok) throw new TRPCError({ code: "BAD_REQUEST", message: body.msg ?? body.message ?? "Não foi possível enviar o convite." });
  return body.user ?? body as { id: string };
}

export async function createPortalUser(input: { email: string; displayName: string; profileKey: string }, actor: PortalIdentity) {
  const authUser = await ensureAuthInvitation(input.email, input.displayName);
  const database = getSupabasePool();
  const portalUser = await database.query<{ id: string }>(
    `insert into public.portal_users (auth_user_id, email, display_name, status)
     values ($1, $2, $3, 'active')
     on conflict (email) do update set auth_user_id = excluded.auth_user_id, display_name = excluded.display_name, status = 'active', updated_at = now()
     returning id`,
    [authUser.id, input.email, input.displayName],
  );
  await assignProfile(portalUser.rows[0].id, input.profileKey, actor);
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

export async function updatePortalUser(userId: string, input: { status: "active" | "inactive"; profileKey: string }, actor: PortalIdentity) {
  const database = getSupabasePool();
  await database.query("update public.portal_users set status = $2, updated_at = now() where id = $1", [userId, input.status]);
  await assignProfile(userId, input.profileKey, actor);
  return { success: true } as const;
}

export async function resendInvite(email: string) {
  const { projectUrl, serviceRoleKey } = serviceConfig();
  const response = await fetch(`${projectUrl}/auth/v1/recover`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, redirect_to: "https://gestaolog-ehcfqbaf.manus.space" }),
  });
  if (!response.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível enviar a redefinição de senha." });
  return { success: true } as const;
}

export async function resendActivationInvite(userId: string) {
  const database = getSupabasePool();
  const result = await database.query<{ email: string; display_name: string | null; auth_user_id: string | null; email_confirmed_at: Date | null }>(
    `select portal.email, portal.display_name, portal.auth_user_id, auth.email_confirmed_at
     from public.portal_users portal
     left join auth.users auth on auth.id = portal.auth_user_id
     where portal.id = $1`,
    [userId],
  );
  const user = result.rows[0];
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  if (user.email_confirmed_at) throw new TRPCError({ code: "BAD_REQUEST", message: "Este usuário já concluiu a ativação." });
  const { projectUrl, serviceRoleKey } = serviceConfig();
  const response = await fetch(`${projectUrl}/auth/v1/invite`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, data: { display_name: user.display_name, portal_environment: "homologacao" }, redirect_to: "https://gestaolog-ehcfqbaf.manus.space" }),
  });
  const body = await response.json();
  if (!response.ok) throw new TRPCError({ code: "BAD_REQUEST", message: body.msg ?? body.message ?? "Não foi possível reenviar o convite de ativação." });
  const authUserId = body.user?.id ?? body.id;
  if (authUserId && !user.auth_user_id) await database.query("update public.portal_users set auth_user_id = $2, status = 'active', updated_at = now() where id = $1", [userId, authUserId]);
  return { success: true } as const;
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
