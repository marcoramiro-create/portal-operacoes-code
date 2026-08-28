import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getPortalIdentity } from "../supabasePortal";
import { approveMaintenance, assetSummary, createAsset, createMaintenance, listAssets, listMaintenance, updateMaintenanceStatus, type AssetType } from "../assetMaintenance";

function authorizationHeader(headers: Record<string, string | string[] | undefined>) { const value = headers.authorization; return Array.isArray(value) ? value[0] : value; }
const assetType = z.enum(["forklift", "industrial_equipment", "tool"]);
const typeInput = z.object({ type: assetType });
const assetInput = z.object({ type: assetType, code: z.string().trim().min(1).max(120), name: z.string().trim().min(1).max(255), serialNumber: z.string().trim().max(255).optional(), externalIdentifier: z.string().trim().max(255).optional(), status: z.string().trim().max(40).optional(), criticality: z.string().trim().max(40).optional(), sector: z.string().trim().max(255).optional(), productionLine: z.string().trim().max(255).optional(), physicalPosition: z.string().trim().max(255).optional(), calibrationRequired: z.boolean().optional(), calibrationDueAt: z.string().datetime().optional(), metadata: z.record(z.string(), z.unknown()).optional() });
const maintenanceInput = z.object({ type: assetType, assetId: z.string().min(1), maintenanceType: z.enum(["preventive", "predictive", "corrective", "inspection", "calibration", "improvement"]), priority: z.enum(["low", "normal", "high", "urgent"]).optional(), description: z.string().trim().min(1).max(5000), scheduledAt: z.string().datetime().optional(), executorType: z.string().trim().max(40).optional(), executorName: z.string().trim().max(255).optional(), notes: z.string().trim().max(5000).optional() });

export const assetMaintenanceRouter = router({
  assets: publicProcedure.input(typeInput).query(async ({ ctx, input }) => listAssets(input.type as AssetType, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  summary: publicProcedure.input(typeInput).query(async ({ ctx, input }) => assetSummary(input.type as AssetType, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  maintenance: publicProcedure.input(typeInput).query(async ({ ctx, input }) => listMaintenance(input.type as AssetType, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  createAsset: publicProcedure.input(assetInput).mutation(async ({ ctx, input }) => createAsset({ ...input, assetType: input.type }, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  createMaintenance: publicProcedure.input(maintenanceInput).mutation(async ({ ctx, input }) => createMaintenance(input, input.type as AssetType, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  approveMaintenance: publicProcedure.input(z.object({ id: z.string().min(1) })).mutation(async ({ ctx, input }) => approveMaintenance(input.id, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  updateMaintenance: publicProcedure.input(z.object({ id: z.string().min(1), status: z.enum(["in_progress", "waiting_parts", "completed", "cancelled"]) })).mutation(async ({ ctx, input }) => updateMaintenanceStatus(input.id, input.status, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
});
