import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { TRPCError } from "@trpc/server";
import { assertApplicationPermission, type PortalIdentity } from "./supabasePortal";
import { storagePut } from "./storage";

let pool: Pool | undefined;
function getPool() {
  if (!pool) pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || "" });
  return pool;
}
function nodeForType(type: string) {
  return type === "forklift" ? "ativos-empilhadeiras" : type === "industrial_equipment" ? "ativos-equipamentos-industria" : "ativos-ferramentas";
}

export async function listAttachments(input: { assetId: string; type: "forklift" | "industrial_equipment" | "tool" }, identity: PortalIdentity) {
  await assertApplicationPermission(identity, nodeForType(input.type), "view");
  const result = await getPool().query(`SELECT id, assetId, maintenanceId, fileName, mimeType, storageUrl, sizeBytes, createdAt FROM assetAttachments WHERE assetId = $1 ORDER BY createdAt DESC`, [input.assetId]);
  return result.rows;
}

export async function uploadAttachment(input: { assetId: string; type: "forklift" | "industrial_equipment" | "tool"; fileName: string; mimeType: string; contentBase64: string; maintenanceId?: string }, identity: PortalIdentity) {
  await assertApplicationPermission(identity, nodeForType(input.type), "manage");
  const bytes = Buffer.from(input.contentBase64, "base64");
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "O anexo deve ter até 10 MB." });
  const assetResult = await getPool().query(`SELECT id FROM assetAssets WHERE id = $1 AND assetType = $2 AND active = 1`, [input.assetId, input.type]);
  if (!assetResult.rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Ativo não encontrado." });
  const stored = await storagePut(`asset-attachments/${identity.id}/${input.assetId}/${input.fileName}`, bytes, input.mimeType || "application/octet-stream");
  const id = randomUUID();
  await getPool().query(`INSERT INTO assetAttachments (id, assetId, maintenanceId, fileName, mimeType, storageKey, storageUrl, sizeBytes, createdByUserId) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [id, input.assetId, input.maintenanceId ?? null, input.fileName, input.mimeType || "application/octet-stream", stored.key, stored.url, bytes.length, identity.id]);
  return { id, url: stored.url };
}