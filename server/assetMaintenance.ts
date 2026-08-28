import { randomUUID } from "node:crypto";
import { createPool, type Pool } from "mysql2/promise";
import { TRPCError } from "@trpc/server";
import { assertApplicationPermission, type PortalIdentity } from "./supabasePortal";

let pool: Pool | undefined;
function getPool() {
  if (!pool) pool = createPool(process.env.DATABASE_URL ?? "");
  return pool;
}

export type AssetType = "forklift" | "industrial_equipment" | "tool";
export type AssetInput = {
  assetType: AssetType; code: string; name: string; serialNumber?: string; externalIdentifier?: string;
  status?: string; criticality?: string; companyId?: string; branchId?: string; warehouseId?: string;
  stockLocationId?: string; costCenterId?: string; sector?: string; productionLine?: string;
  physicalPosition?: string; calibrationRequired?: boolean; calibrationDueAt?: string; metadata?: Record<string, unknown>;
};
export type MaintenanceInput = {
  assetId: string; maintenanceType: "preventive" | "predictive" | "corrective" | "inspection" | "calibration" | "improvement";
  priority?: "low" | "normal" | "high" | "urgent"; description: string; scheduledAt?: string; executorType?: string; executorName?: string; notes?: string;
};

function nodeForType(type: AssetType) { return type === "forklift" ? "ativos-empilhadeiras" : type === "industrial_equipment" ? "ativos-equipamentos-industria" : "ativos-ferramentas"; }
async function permission(identity: PortalIdentity, type: AssetType, level: "view" | "manage" | "approve") { await assertApplicationPermission(identity, nodeForType(type), level); }

function rows<T>(result: any): T[] { return Array.isArray(result) && Array.isArray(result[0]) ? result[0] as T[] : result as T[]; }

export async function listAssets(type: AssetType, identity: PortalIdentity) {
  await permission(identity, type, "view");
  const [result] = await getPool().query(`SELECT id, assetType, code, name, serialNumber, externalIdentifier, status, criticality, sector, productionLine, physicalPosition, calibrationRequired, calibrationDueAt, metadata, createdAt, updatedAt FROM assetAssets WHERE assetType = ? AND active = 1 ORDER BY code`, [type]);
  return rows(result);
}

export async function createAsset(input: AssetInput, identity: PortalIdentity) {
  await permission(identity, input.assetType, "manage");
  const id = randomUUID();
  try {
    await getPool().query(`INSERT INTO assetAssets (id, assetType, code, name, serialNumber, externalIdentifier, status, criticality, companyId, branchId, warehouseId, stockLocationId, costCenterId, sector, productionLine, physicalPosition, calibrationRequired, calibrationDueAt, metadata, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, input.assetType, input.code.trim(), input.name.trim(), input.serialNumber?.trim() || null, input.externalIdentifier?.trim() || null, input.status ?? "active", input.criticality ?? null, input.companyId ?? null, input.branchId ?? null, input.warehouseId ?? null, input.stockLocationId ?? null, input.costCenterId ?? null, input.sector?.trim() || null, input.productionLine?.trim() || null, input.physicalPosition?.trim() || null, input.calibrationRequired ?? false, input.calibrationDueAt ?? null, JSON.stringify(input.metadata ?? {}), identity.id]);
    await getPool().query(`INSERT INTO assetEvents (id, assetId, eventType, details, actorUserId) VALUES (?, ?, 'created', ?, ?)`, [randomUUID(), id, JSON.stringify({ code: input.code, assetType: input.assetType }), identity.id]);
    return { id };
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") throw new TRPCError({ code: "CONFLICT", message: "Já existe um ativo com este código." });
    throw error;
  }
}

export async function listMaintenance(type: AssetType, identity: PortalIdentity) {
  await permission(identity, type, "view");
  const [result] = await getPool().query(`SELECT o.id, o.orderNumber, o.assetId, a.code AS assetCode, a.name AS assetName, a.assetType, o.maintenanceType, o.status, o.priority, o.description, o.executorType, o.executorName, o.scheduledAt, o.createdAt, o.approvalRequired FROM assetMaintenanceOrders o JOIN assetAssets a ON a.id = o.assetId WHERE a.assetType = ? ORDER BY o.createdAt DESC`, [type]);
  return rows(result);
}

export async function createMaintenance(input: MaintenanceInput, type: AssetType, identity: PortalIdentity) {
  await permission(identity, type, "manage");
  const [assetResult] = await getPool().query(`SELECT id FROM assetAssets WHERE id = ? AND assetType = ? AND active = 1`, [input.assetId, type]);
  if (!rows(assetResult).length) throw new TRPCError({ code: "NOT_FOUND", message: "Ativo não encontrado para esta aplicação." });
  const id = randomUUID();
  await getPool().query(`INSERT INTO assetMaintenanceOrders (id, assetId, maintenanceType, status, priority, requestedByUserId, executorType, executorName, approvalRequired, scheduledAt, description, notes) VALUES (?, ?, ?, 'requested', ?, ?, ?, ?, 1, ?, ?, ?)`, [id, input.assetId, input.maintenanceType, input.priority ?? "normal", identity.id, input.executorType?.trim() || null, input.executorName?.trim() || null, input.scheduledAt ?? null, input.description.trim(), input.notes?.trim() || null]);
  await getPool().query(`INSERT INTO assetEvents (id, assetId, eventType, details, actorUserId) VALUES (?, ?, 'maintenance_requested', ?, ?)`, [randomUUID(), input.assetId, JSON.stringify({ maintenanceId: id, maintenanceType: input.maintenanceType }), identity.id]);
  return { id };
}

export async function approveMaintenance(id: string, identity: PortalIdentity) {
  const [result] = await getPool().query<any>(`SELECT o.id, a.assetType, o.assetId FROM assetMaintenanceOrders o JOIN assetAssets a ON a.id = o.assetId WHERE o.id = ?`, [id]);
  const current = rows<any>(result)[0];
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Ordem de manutenção não encontrada." });
  await permission(identity, current.assetType as AssetType, "approve");
  await getPool().query(`UPDATE assetMaintenanceOrders SET status = 'approved', approvedByUserId = ?, approvedAt = CURRENT_TIMESTAMP WHERE id = ? AND status = 'requested'`, [identity.id, id]);
  await getPool().query(`INSERT INTO assetEvents (id, assetId, eventType, details, actorUserId) VALUES (?, ?, 'maintenance_approved', ?, ?)`, [randomUUID(), current.assetId, JSON.stringify({ maintenanceId: id }), identity.id]);
  return { success: true };
}

export async function updateMaintenanceStatus(id: string, status: "in_progress" | "waiting_parts" | "completed" | "cancelled", identity: PortalIdentity) {
  const [result] = await getPool().query<any>(`SELECT o.id, a.assetType, o.assetId FROM assetMaintenanceOrders o JOIN assetAssets a ON a.id = o.assetId WHERE o.id = ?`, [id]);
  const current = rows<any>(result)[0];
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Ordem de manutenção não encontrada." });
  await permission(identity, current.assetType as AssetType, "manage");
  const timestampField = status === "in_progress" ? "startedAt" : status === "completed" ? "completedAt" : null;
  await getPool().query(`UPDATE assetMaintenanceOrders SET status = ?, ${timestampField ? `${timestampField} = CURRENT_TIMESTAMP,` : ""} updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [status, id]);
  await getPool().query(`INSERT INTO assetEvents (id, assetId, eventType, details, actorUserId) VALUES (?, ?, ?, ?, ?)`, [randomUUID(), current.assetId, `maintenance_${status}`, JSON.stringify({ maintenanceId: id }), identity.id]);
  return { success: true };
}

export async function listChecklistTemplates(identity: PortalIdentity) {
  await permission(identity, "forklift", "view");
  const [result] = await getPool().query(`SELECT id, name, items, active, createdAt, updatedAt FROM assetChecklistTemplates WHERE assetType = 'forklift' AND active = 1 ORDER BY name`);
  return rows(result);
}

export async function createChecklistTemplate(input: { name: string; items: string[] }, identity: PortalIdentity) {
  await permission(identity, "forklift", "manage");
  if (!input.items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe ao menos um item no checklist." });
  const id = randomUUID();
  try {
    await getPool().query(`INSERT INTO assetChecklistTemplates (id, assetType, name, items, createdByUserId) VALUES (?, 'forklift', ?, ?, ?)`, [id, input.name.trim(), JSON.stringify(input.items.map(item => item.trim()).filter(Boolean)), identity.id]);
    return { id };
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") throw new TRPCError({ code: "CONFLICT", message: "Já existe um checklist com este nome." });
    throw error;
  }
}

export async function assetSummary(type: AssetType, identity: PortalIdentity) {
  await permission(identity, type, "view");
  const [result] = await getPool().query(`SELECT status, COUNT(*) AS total FROM assetAssets WHERE assetType = ? AND active = 1 GROUP BY status ORDER BY status`, [type]);
  const [orders] = await getPool().query(`SELECT o.status, COUNT(*) AS total FROM assetMaintenanceOrders o JOIN assetAssets a ON a.id = o.assetId WHERE a.assetType = ? GROUP BY o.status ORDER BY o.status`, [type]);
  return { assets: rows(result), maintenance: rows(orders) };
}
