import { TRPCError } from "@trpc/server";
import { createPasswordResetToken } from "./portalAuthService";
import { getSupabasePool } from "./supabasePortal";

export async function createPortalPasswordLink(email: string, request: { ip?: string }) {
  const result = await getSupabasePool().query<{ id: string; password_hash: string | null }>("select id, password_hash from public.portal_users where lower(email)=lower($1) and status='active'", [email]);
  const user = result.rows[0];
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário ativo não encontrado." });
  const token = await createPasswordResetToken(user.id, request);
  return { url: `/acesso?reset=${encodeURIComponent(token)}`, activation: !user.password_hash };
}

export async function resendPortalInvite(email: string, request: { ip?: string }) {
  return createPortalPasswordLink(email, request);
}

export async function resendPortalActivation(userId: string, request: { ip?: string }) {
  const result = await getSupabasePool().query<{ email: string }>("select email from public.portal_users where id=$1 and status='active'", [userId]);
  if (!result.rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  return createPortalPasswordLink(result.rows[0].email, request);
}
