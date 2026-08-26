import { TRPCError } from "@trpc/server";
import { RegistrationType, registrationTypes } from "../shared/registrationLayouts";
import { getSupabasePool, PortalIdentity } from "./supabasePortal";

export const registrationOperations = ["view", "create", "import", "manage"] as const;
export type RegistrationOperation = typeof registrationOperations[number];
export type RegistrationOperations = Record<RegistrationOperation, boolean>;

export function defaultRegistrationOperations(identity: Pick<PortalIdentity, "isDevelopmentAdmin" | "profiles">): RegistrationOperations {
  if (identity.isDevelopmentAdmin || identity.profiles.includes("operations-admin")) return { view: true, create: true, import: true, manage: true };
  if (identity.profiles.includes("manager")) return { view: true, create: true, import: false, manage: false };
  return { view: true, create: false, import: false, manage: false };
}

export async function registrationOperationsFor(identity: PortalIdentity, type: RegistrationType) {
  const operations = defaultRegistrationOperations(identity);
  const result = await getSupabasePool().query<{ operation: RegistrationOperation; allowed: boolean }>("select operation, allowed from public.registration_operation_permissions where user_id = $1 and registration_type = $2", [identity.id, type]);
  result.rows.forEach(row => { operations[row.operation] = row.allowed; });
  return operations;
}

export async function assertRegistrationOperation(identity: PortalIdentity, type: RegistrationType, operation: RegistrationOperation) {
  const operations = await registrationOperationsFor(identity, type);
  if (!operations[operation]) throw new TRPCError({ code: "FORBIDDEN", message: "Você não possui liberação para esta operação de cadastro." });
  return operations;
}

export async function listRegistrationPermissions(userId: string, profiles: string[], isDevelopmentAdmin: boolean) {
  const identity: PortalIdentity = { id: userId, email: "", displayName: null, profiles, isDevelopmentAdmin };
  const rows = await Promise.all(registrationTypes.map(async type => ({ type, operations: await registrationOperationsFor(identity, type) })));
  return rows;
}

export async function resolvedRegistrationPermissionsForUser(userId: string) {
  const result = await getSupabasePool().query<{ is_development_admin: boolean; profile_keys: string[] | null }>(
    `select user_record.is_development_admin, coalesce(array_agg(profile.profile_key) filter (where profile.profile_key is not null), '{}') as profile_keys
     from public.portal_users user_record
     left join public.user_profile_assignments assignment on assignment.user_id = user_record.id
     left join public.access_profiles profile on profile.id = assignment.profile_id
     where user_record.id = $1
     group by user_record.id`, [userId],
  );
  const user = result.rows[0];
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  return listRegistrationPermissions(userId, user.profile_keys ?? [], user.is_development_admin);
}

export async function updateRegistrationPermission(input: { userId: string; type: RegistrationType; operation: RegistrationOperation; allowed: boolean }, actor: PortalIdentity) {
  const target = await getSupabasePool().query<{ is_development_admin: boolean }>("select is_development_admin from public.portal_users where id = $1", [input.userId]);
  if (!target.rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  if (target.rows[0].is_development_admin) throw new TRPCError({ code: "FORBIDDEN", message: "As permissões do administrador técnico não são alteradas por esta tela." });
  await getSupabasePool().query(`insert into public.registration_operation_permissions (user_id, registration_type, operation, allowed, updated_by_user_id)
    values ($1, $2, $3, $4, $5)
    on conflict (user_id, registration_type, operation) do update set allowed = excluded.allowed, updated_by_user_id = excluded.updated_by_user_id, updated_at = now()`, [input.userId, input.type, input.operation, input.allowed, actor.id]);
  return { success: true as const };
}
