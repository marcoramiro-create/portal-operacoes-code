import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { PoolClient } from "pg";
import { TRPCError } from "@trpc/server";
import { getSupabasePool } from "./supabasePortal";

const scrypt = promisify(scryptCallback);
const PASSWORD_KEY_LENGTH = 64;
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 1000 * 60 * 15;

export type PortalAuthIdentity = {
  id: string;
  email: string;
  displayName: string | null;
  isDevelopmentAdmin: boolean;
  profiles: string[];
};

type PasswordHashParts = { cost: number; blockSize: number; parallelization: number; salt: Buffer; digest: Buffer };

function digestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPortalPassword(password: string) {
  if (password.length < 12) throw new TRPCError({ code: "BAD_REQUEST", message: "Use uma senha com pelo menos 12 caracteres." });
  const salt = randomBytes(16);
  const cost = 16384;
  const blockSize = 8;
  const parallelization = 1;
  const digest = (await scrypt(password, salt, PASSWORD_KEY_LENGTH, { N: cost, r: blockSize, p: parallelization })) as Buffer;
  return `scrypt$${cost}$${blockSize}$${parallelization}$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

function parsePasswordHash(encoded: string): PasswordHashParts | null {
  const [algorithm, cost, blockSize, parallelization, salt, digest] = encoded.split("$");
  if (algorithm !== "scrypt" || !cost || !blockSize || !parallelization || !salt || !digest) return null;
  try { return { cost: Number(cost), blockSize: Number(blockSize), parallelization: Number(parallelization), salt: Buffer.from(salt, "base64url"), digest: Buffer.from(digest, "base64url") }; } catch { return null; }
}

export async function verifyPortalPassword(password: string, encoded: string | null) {
  const parsed = encoded ? parsePasswordHash(encoded) : null;
  if (!parsed || !Number.isSafeInteger(parsed.cost) || parsed.cost < 16384 || parsed.digest.length !== PASSWORD_KEY_LENGTH) return false;
  const digest = (await scrypt(password, parsed.salt, parsed.digest.length, { N: parsed.cost, r: parsed.blockSize, p: parsed.parallelization })) as Buffer;
  return timingSafeEqual(parsed.digest, digest);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function sessionTokenHash(token: string) {
  return digestToken(token);
}

export async function createPortalSession(userId: string, request: { ip?: string; userAgent?: string }, client?: PoolClient) {
  const token = createSessionToken();
  const database = client ?? getSupabasePool();
  await database.query("insert into public.portal_sessions (user_id, token_hash, expires_at, ip_address, user_agent) values ($1, $2, $3, $4, $5)", [userId, sessionTokenHash(token), new Date(Date.now() + SESSION_TTL_MS), request.ip ?? null, request.userAgent ?? null]);
  return { token, expiresAt: new Date(Date.now() + SESSION_TTL_MS) };
}

export async function revokePortalSession(token: string) {
  await getSupabasePool().query("update public.portal_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null", [sessionTokenHash(token)]);
}

export async function authenticatePortalSession(token: string): Promise<PortalAuthIdentity | null> {
  const result = await getSupabasePool().query<PortalAuthIdentity & { profile_keys: string[] | null }>(
    `select u.id, u.email, u.display_name as "displayName", u.is_development_admin as "isDevelopmentAdmin",
       coalesce(array_agg(p.profile_key) filter (where p.profile_key is not null), '{}') as profile_keys
     from public.portal_sessions s
     join public.portal_users u on u.id = s.user_id
     left join public.user_profile_assignments assignment on assignment.user_id = u.id
     left join public.access_profiles p on p.id = assignment.profile_id
     where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and u.status = 'active'
     group by u.id, s.id`, [sessionTokenHash(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  await getSupabasePool().query("update public.portal_sessions set last_seen_at = now() where token_hash = $1", [sessionTokenHash(token)]);
  return { id: row.id, email: row.email, displayName: row.displayName, isDevelopmentAdmin: row.isDevelopmentAdmin, profiles: row.profile_keys ?? [] };
}

export async function recordPortalAuthEvent(eventType: string, userId: string | null, details: Record<string, unknown> = {}) {
  await getSupabasePool().query("insert into public.portal_auth_events (user_id, event_type, details) values ($1, $2, $3::jsonb)", [userId, eventType, JSON.stringify(details)]);
}

export async function loginWithPortalPassword(email: string, password: string, request: { ip?: string; userAgent?: string }) {
  const database = getSupabasePool();
  const result = await database.query<{ id: string; email: string; password_hash: string | null; status: string; locked_until: Date | null }>("select id, email, password_hash, status, locked_until from public.portal_users where lower(email) = lower($1) limit 1", [email]);
  const user = result.rows[0];
  if (!user || user.status !== "active" || (user.locked_until && user.locked_until > new Date())) { await recordPortalAuthEvent("login_failure", user?.id ?? null, { reason: "not_available" }); throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha inválidos." }); }
  if (!user.password_hash) throw new TRPCError({ code: "CONFLICT", message: "Autenticação própria ainda não ativada para este usuário." });
  if (!(await verifyPortalPassword(password, user.password_hash))) {
    await database.query("update public.portal_users set failed_login_count = failed_login_count + 1, locked_until = case when failed_login_count + 1 >= $2 then now() + ($3 * interval '1 millisecond') else locked_until end where id = $1", [user.id, MAX_FAILED_LOGINS, LOCK_DURATION_MS]);
    await recordPortalAuthEvent("login_failure", user.id, { reason: "invalid_password" });
    throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha inválidos." });
  }
  await database.query("update public.portal_users set failed_login_count = 0, locked_until = null, last_login_at = now() where id = $1", [user.id]);
  const session = await createPortalSession(user.id, request);
  await recordPortalAuthEvent("login_success", user.id);
  return session;
}
