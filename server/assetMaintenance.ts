import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { TRPCError } from "@trpc/server";
import { assertApplicationPermission, type PortalIdentity } from "./supabasePortal";

let pool: Pool | undefined;

function getPool() {
  if (!pool) pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || "" });
  return pool;
}

function rows<T>(result: any): T[] { return result.rows as T[]; }

type AssetType = "forklift" | "industrial_equipment" | "tool";

async function permission(identity: PortalIdentity, type: AssetType, action: "view" | "manage" | "approve") {
  const node = type === "forklift" ? "ativos-empilhadeiras" : type === "industrial_equipment" ? "ativos-equipamentos-industria" : "ativos-ferramentas";
  await assertApplicationPermission(identity, node, action);
}

export type MaintenanceInput = {
  assetId: string; maintenanceType: "preventive" | "predictive" | "corrective" | "inspection" | "calibration" | "improvement";
  priority?: "low" | "normal" | "high" | "urgent"; description: string; scheduledAt?: string; executorType?: string; executorName?: string; notes?: string;
};

export async function listAssets(type: AssetType, identity: PortalIdentity) {
  await permission(identity, type, "view");
  const result = await getPool().query(`SELECT id, assetType, code, name, serialNumber, externalIdentifier, status, criticality, companyId, branchId, warehouseId, stockLocationId, costCenterId, sector, productionLine, physicalPosition, calibrationRequired, calibrationDueAt, createdByUserId, createdAt, updatedAt FROM assetAssets WHERE assetType = $1 AND active = 1 ORDER BY name`, [type]);
  return rows(result);
}

export async function createAsset(input: any, type: AssetType, identity: PortalIdentity) {
  await permission(identity, type, "manage");
  const id = randomUUID();
  await getPool().query(`INSERT INTO assetAssets (id, assetType, code, name, serialNumber, externalIdentifier, status, criticality, companyId, branchId, warehouseId, stockLocationId, costCenterId, sector, productionLine, physicalPosition, calibrationRequired, calibrationDueAt, metadata, createdByUserId) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`, [id, input.assetType, input.code.trim(), input.name.trim(), input.serialNumber?.trim() || null, input.externalIdentifier?.trim() || null, input.status ?? "active", input.criticality ?? null, input.companyId ?? null, input.branchId ?? null, input.warehouseId ?? null, input.stockLocationId ?? null, input.costCenterId ?? null, input.sector ?? null, input.productionLine ?? null, input.physicalPosition ?? null, input.calibrationRequired ?? false, input.calibrationDueAt ?? null, JSON.stringify(input.metadata ?? {}), identity.id]);
  return { id };
}

export async function createMaintenance(input: MaintenanceInput, type: AssetType, identity: PortalIdentity) {
  await permission(identity, type, "manage");
  const assetResult = await getPool().query(`SELECT id FROM assetAssets WHERE id = $1 AND assetType = $2 AND active = 1`, [input.assetId, type]);
  if (!rows(assetResult).length) throw new TRPCError({ code: "NOT_FOUND", message: "Ativo não encontrado." });
  const id = randomUUID();
  await getPool().query(`INSERT INTO assetMaintenanceOrders (id, assetId, maintenanceType, status, priority, requestedByUserId, executorType, executorName, approvalRequired, scheduledAt, description, notes) VALUES ($1, $2, $3, 'requested', $4, $5, $6, $7, 1, $8, $9, $10)`, [id, input.assetId, input.maintenanceType, input.priority ?? "normal", identity.id, input.executorType?.trim() || null, input.executorName?.trim() || null, input.scheduledAt ?? null, input.description.trim(), input.notes?.trim() || null]);
  return { id };
}


export async function updateMaintenanceStatus(id: string, status: "in_progress" | "waiting_parts" | "completed" | "cancelled", identity: PortalIdentity) {
  const result = await getPool().query<any>(`SELECT o.id, a.assetType, o.assetId FROM assetMaintenanceOrders o JOIN assetAssets a ON a.id = o.assetId WHERE o.id = $1`, [id]);
  const current = rows(result)[0];
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Ordem de manutenção não encontrada." });
  await permission(identity, current.assetType as AssetType, "manage");
  const timestampField = status === "in_progress" ? "startedAt" : status === "completed" ? "completedAt" : null;
  await getPool().query(`UPDATE assetMaintenanceOrders SET status = $1${timestampField ? `, ${timestampField} = CURRENT_TIMESTAMP,` : ""} updatedAt = CURRENT_TIMESTAMP WHERE id = $2`, [status, id]);
  return { id };
}

export async function listMaintenanceDashboard(type: AssetType, identity: PortalIdentity) {
  await permission(identity, type, "view");
  const result = await getPool().query(`SELECT id, assetType, code, name, serialNumber, status, criticality FROM assetAssets WHERE assetType = $1 AND active = 1 ORDER BY name`, [type]);
  const orders = await getPool().query(`SELECT o.status, COUNT(*) AS total FROM assetMaintenanceOrders o JOIN assetAssets a ON a.id = o.assetId WHERE a.assetType = $1 GROUP BY o.status ORDER BY o.status`, [type]);
  return { assets: rows(result), maintenance: rows(orders) };
}

export async function listMaintenance(type: AssetType, identity: PortalIdentity) {
await permission(identity, type, "view");
const result = await getPool().query(`SELECT o.id, o.assetId, o.maintenanceType, o.status, o.priority, o.scheduledAt, o.description, o.createdAt, a.code AS assetCode, a.name AS assetName FROM assetMaintenanceOrders o JOIN assetAssets a ON a.id = o.assetId WHERE a.assetType = $1 ORDER BY o.createdAt DESC`, [type]);
return rows(result);
}


export async function listServiceProviders(type: AssetType, identity: PortalIdentity) {
await permission(identity, type, "view");
const result = await getPool().query(`SELECT id, providerType, name, document, contact, active, createdAt FROM assetServiceProviders WHERE active = 1 ORDER BY name`);
return rows(result);
}

export async function createServiceProvider(input: { assetType: AssetType; providerType: string; name: string; document?: string; contact?: string }, identity: PortalIdentity) {
await permission(identity, input.assetType, "manage");
const id = randomUUID();
await getPool().query(`INSERT INTO assetServiceProviders (id, providerType, name, document, contact, createdByUserId) VALUES ($1, $2, $3, $4, $5, $6)`, [id, input.providerType.trim(), input.name.trim(), input.document?.trim() || null, input.contact?.trim() || null, identity.id]);
return { id };
}

export async function listChecklistTemplates(identity: PortalIdentity) {
await permission(identity, "forklift", "view");
const result = await getPool().query(`SELECT id, name, items, active, createdAt, updatedAt FROM assetChecklistTemplates WHERE assetType = 'forklift' AND active = 1 ORDER BY name`);
return rows(result);
}

export async function createChecklistTemplate(input: { name: string; items: string[] }, identity: PortalIdentity) {
await permission(identity, "forklift", "manage");
if (!input.items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe ao menos um item no checklist." });
const id = randomUUID();
await getPool().query(`INSERT INTO assetChecklistTemplates (id, assetType, name, items, createdByUserId) VALUES ($1, 'forklift', $2, $3, $4)`, [id, input.name.trim(), JSON.stringify(input.items.map(item => item.trim()).filter(Boolean)), identity.id]);
return { id };
}