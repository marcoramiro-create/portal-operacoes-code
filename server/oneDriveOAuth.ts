import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import { authenticatePortalSession } from "./portalAuthService";
import { getPortalIdentity, type PortalIdentity, getSupabasePool } from "./supabasePortal";

const GRAPH = "https://graph.microsoft.com/v1.0";
const AUTHORITY = `https://login.microsoftonline.com/${ENV.onedriveTenantId}`;
const SCOPES = "openid profile offline_access User.Read Files.Read";
const OAUTH_USER_COOKIE = "onedrive_oauth_user";
if (!ENV.onedriveTokenKey) throw new Error("ONEDRIVE_TOKEN_KEY não configurada.");
const KEY = createHash("sha256").update(ENV.onedriveTokenKey).digest();

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };
type Connection = { user_id: string; access_token_enc: string; refresh_token_enc: string | null; expires_at: Date };
type ActiveConnection = { user_id: string; access_token: string; refresh_token: string | null; expires_at: Date };

function cookieValue(req: Request, name: string) {
  return req.headers.cookie?.split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
}
function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
function decrypt(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
function portalToken(req: Request) { return cookieValue(req, COOKIE_NAME); }
function authorizationHeader(req: Request) {
  const value = req.headers.authorization;
  return Array.isArray(value) ? value[0] : value;
}
function signedOAuthUser(userId: string) {
  const signature = createHmac("sha256", KEY).update(`onedrive:${userId}`).digest("base64url");
  return `${userId}.${signature}`;
}
function verifiedOAuthUser(value: string | undefined) {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const userId = value.slice(0, separator);
  const received = value.slice(separator + 1);
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !received) return null;
  const expected = createHmac("sha256", KEY).update(`onedrive:${userId}`).digest("base64url");
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right) ? userId : null;
}
async function identityById(userId: string): Promise<PortalIdentity | null> {
  const result = await getSupabasePool().query<{ id: string; email: string; display_name: string | null; is_development_admin: boolean; profile_keys: string[] | null }>(
    `select u.id, u.email, u.display_name, u.is_development_admin,
       coalesce(array_agg(p.profile_key) filter (where p.profile_key is not null), '{}') as profile_keys
     from public.portal_users u
     left join public.user_profile_assignments assignment on assignment.user_id = u.id
     left join public.access_profiles p on p.id = assignment.profile_id
     where u.id = $1 and u.status = 'active'
     group by u.id`,
    [userId],
  );
  const row = result.rows[0];
  return row ? { id: row.id, email: row.email, displayName: row.display_name, isDevelopmentAdmin: row.is_development_admin, profiles: row.profile_keys ?? [] } : null;
}
function isAdministrator(identity: PortalIdentity | null): identity is PortalIdentity {
  return Boolean(identity?.isDevelopmentAdmin || identity?.profiles.includes("operations-admin"));
}
async function currentAdmin(req: Request): Promise<PortalIdentity> {
  let identity: PortalIdentity | null = null;
  const token = portalToken(req);
  if (token) identity = await authenticatePortalSession(token);
  if (!identity && authorizationHeader(req)) {
    try { identity = await getPortalIdentity(authorizationHeader(req)); } catch { identity = null; }
  }
  if (!isAdministrator(identity)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem conectar o OneDrive." });
  return identity;
}
async function currentOAuthAdmin(req: Request): Promise<PortalIdentity> {
  try { return await currentAdmin(req); } catch {
    const identity = await identityById(verifiedOAuthUser(cookieValue(req, OAUTH_USER_COOKIE)) ?? "00000000-0000-0000-0000-000000000000");
    if (!isAdministrator(identity)) throw new TRPCError({ code: "FORBIDDEN", message: "A sessão administrativa do OneDrive expirou. Inicie a conexão novamente." });
    return identity;
  }
}
async function exchangeCode(code: string, verifier: string): Promise<TokenResponse> {
  const response = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: ENV.onedriveClientId, grant_type: "authorization_code", code, redirect_uri: ENV.onedriveRedirectUri, code_verifier: verifier, scope: SCOPES }) });
  if (!response.ok) throw new Error(`Microsoft token exchange failed: ${response.status}`);
  return response.json() as Promise<TokenResponse>;
}
async function refreshToken(connection: ActiveConnection): Promise<ActiveConnection> {
  if (!connection.refresh_token) throw new Error("OneDrive precisa ser conectado novamente.");
  const response = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: ENV.onedriveClientId, grant_type: "refresh_token", refresh_token: connection.refresh_token, scope: SCOPES }) });
  if (!response.ok) throw new Error("Não foi possível renovar a autorização do OneDrive.");
  const token = await response.json() as TokenResponse;
  const next = { ...connection, access_token: token.access_token, refresh_token: token.refresh_token ?? connection.refresh_token, expires_at: new Date(Date.now() + token.expires_in * 1000) };
  await saveConnection(next);
  return next;
}
async function getConnection(userId: string) {
  const result = await getSupabasePool().query<Connection>("select user_id, access_token_enc, refresh_token_enc, expires_at from public.portal_onedrive_connections where user_id=$1", [userId]);
  return result.rows[0] ?? null;
}
async function saveConnection(token: { user_id: string; access_token: string; refresh_token?: string | null; expires_at: Date }) {
  await getSupabasePool().query(`insert into public.portal_onedrive_connections (user_id, access_token_enc, refresh_token_enc, expires_at) values ($1,$2,$3,$4) on conflict (user_id) do update set access_token_enc=excluded.access_token_enc, refresh_token_enc=excluded.refresh_token_enc, expires_at=excluded.expires_at, updated_at=now()`, [token.user_id, encrypt(token.access_token), token.refresh_token ? encrypt(token.refresh_token) : null, token.expires_at]);
}
async function usableConnection(userId: string) {
  const row = await getConnection(userId);
  if (!row) return null;
  const connection = { ...row, access_token: decrypt(row.access_token_enc), refresh_token: row.refresh_token_enc ? decrypt(row.refresh_token_enc) : null };
  return connection.expires_at.getTime() > Date.now() + 60_000 ? connection : refreshToken(connection);
}
export function oneDriveAuthorizeUrl(req: Request, res: Response, userId: string) {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const options = { ...getSessionCookieOptions(req), maxAge: 10 * 60 * 1000, httpOnly: true };
  res.cookie("onedrive_oauth_state", state, options);
  res.cookie("onedrive_oauth_verifier", verifier, options);
  res.cookie(OAUTH_USER_COOKIE, signedOAuthUser(userId), options);
  const url = new URL(`${AUTHORITY}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({ client_id: ENV.onedriveClientId, response_type: "code", redirect_uri: ENV.onedriveRedirectUri, response_mode: "query", scope: SCOPES, state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  return url.toString();
}
export async function startOneDrive(req: Request, res: Response) {
  const identity = await currentAdmin(req);
  const url = oneDriveAuthorizeUrl(req, res, identity.id);
  if (req.headers.accept?.includes("application/json")) return res.json({ url });
  return res.redirect(url);
}
export async function finishOneDrive(req: Request, res: Response) {
  const state = String(req.query.state ?? "");
  const code = String(req.query.code ?? "");
  if (!state || state !== cookieValue(req, "onedrive_oauth_state") || !code) return res.status(400).send("Autorização do OneDrive inválida ou expirada.");
  const identity = await currentOAuthAdmin(req);
  const verifier = cookieValue(req, "onedrive_oauth_verifier");
  if (!verifier) return res.status(400).send("Sessão OAuth expirada. Tente conectar novamente.");
  const token = await exchangeCode(code, verifier);
  await saveConnection({ user_id: identity.id, access_token: token.access_token, refresh_token: token.refresh_token ?? null, expires_at: new Date(Date.now() + token.expires_in * 1000) });
  const options = getSessionCookieOptions(req);
  res.clearCookie("onedrive_oauth_state", options);
  res.clearCookie("onedrive_oauth_verifier", options);
  res.clearCookie(OAUTH_USER_COOKIE, options);
  return res.redirect("/importacoes/fontes-protheus?onedrive=connected");
}
export async function oneDriveStatus(req: Request) {
  const identity = await currentAdmin(req);
  const connection = await getConnection(identity.id);
  return { connected: Boolean(connection), folderPath: ENV.onedriveFolderPath };
}
export async function listOneDriveFiles(req: Request) {
  const identity = await currentAdmin(req);
  const connection = await usableConnection(identity.id);
  if (!connection) return { connected: false, files: [] };
  const path = encodeURIComponent(ENV.onedriveFolderPath).replace(/%2F/g, "/");
  const response = await fetch(`${GRAPH}/me/drive/root:/${path}:/children?$select=id,name,size,lastModifiedDateTime,file,webUrl&$orderby=lastModifiedDateTime desc`, { headers: { authorization: `Bearer ${connection.access_token}` } });
  if (!response.ok) throw new TRPCError({ code: "BAD_GATEWAY", message: "Não foi possível ler a pasta do OneDrive." });
  const data = await response.json() as { value: Array<{ id: string; name: string; size: number; lastModifiedDateTime: string; file?: { mimeType?: string }; webUrl?: string }> };
  return { connected: true, files: data.value.filter(item => item.file).map(item => ({ id: item.id, name: item.name, size: item.size, modifiedAt: item.lastModifiedDateTime, mimeType: item.file?.mimeType ?? "application/octet-stream", webUrl: item.webUrl ?? null })) };
}
export async function downloadOneDriveFile(req: Request, res: Response) {
  const identity = await currentAdmin(req);
  const connection = await usableConnection(identity.id);
  if (!connection) return res.status(401).send("OneDrive não conectado.");
  const itemId = String(req.query.itemId ?? "");
  if (!itemId || !/^[A-Za-z0-9._-]+$/.test(itemId)) return res.status(400).send("Arquivo inválido.");
  const response = await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}/content`, { headers: { authorization: `Bearer ${connection.access_token}` }, redirect: "manual" });
  const location = response.headers.get("location");
  if (!location) return res.status(502).send("Não foi possível obter o arquivo do OneDrive.");
  const file = await fetch(location);
  if (!file.ok || !file.body) return res.status(502).send("Não foi possível baixar o arquivo do OneDrive.");
  res.setHeader("content-type", file.headers.get("content-type") ?? "application/octet-stream");
  const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(req.query.name ? String(req.query.name) : "onedrive-arquivo")}`;
  res.setHeader("content-disposition", disposition);
  for await (const chunk of file.body as any) res.write(chunk);
  res.end();
}
