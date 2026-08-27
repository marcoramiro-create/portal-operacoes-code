import { z } from "zod";
import { getAnalyticsDashboard, getAnalyticsEvolution, getAnalyticsFilterOptions, importProtheusWorkbook, listProtheusImports } from "../db";
import { publicProcedure, router } from "../_core/trpc";
import { assertApplicationPermission, assertPortalAdministrator, getPortalIdentity, recordPortalAudit, type PortalIdentity } from "../supabasePortal";
import { updateProtheusImportStatus } from "../db";

const curveSchema = z.enum(["A", "B", "C", "D", "E"]);
function authorizationHeader(headers: Record<string, string | string[] | undefined>) { const value = headers.authorization; return Array.isArray(value) ? value[0] : value; }
async function modulePermission(ctx: { req: { headers: Record<string, string | string[] | undefined> } }, permission: "view" | "manage") { const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers)); await assertApplicationPermission(identity, "compras-protheus", permission); return identity; }
export function canAdministerProtheusImports(identity: Pick<PortalIdentity, "isDevelopmentAdmin" | "profiles">) { return identity.isDevelopmentAdmin || identity.profiles.includes("operations-admin"); }

export const analyticsRouter = router({
  dashboard: publicProcedure.input(z.object({ importId: z.number().int().positive().optional(), branch: z.string().min(1).optional(), curve: curveSchema.optional(), productType: z.enum(["ME", "PE"]).optional(), mrp: z.enum(["Sim", "Não"]).optional(), family: z.string().min(1).optional(), subfamily: z.string().min(1).optional() })).query(async ({ ctx, input }) => { await modulePermission(ctx, "view"); return getAnalyticsDashboard(input); }),
  filterOptions: publicProcedure.input(z.object({ importId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => { await modulePermission(ctx, "view"); return getAnalyticsFilterOptions(input?.importId); }),
  imports: publicProcedure.query(async ({ ctx }) => { await modulePermission(ctx, "view"); return listProtheusImports(); }),
  canAdminister: publicProcedure.query(async ({ ctx }) => { const identity = await modulePermission(ctx, "view"); return canAdministerProtheusImports(identity); }),
  evolution: publicProcedure.input(z.object({ branch: z.string().min(1).optional(), curve: curveSchema.optional(), productType: z.enum(["ME", "PE"]).optional(), mrp: z.enum(["Sim", "Não"]).optional(), family: z.string().min(1).optional(), subfamily: z.string().min(1).optional() })).query(async ({ ctx, input }) => { await modulePermission(ctx, "view"); return getAnalyticsEvolution(input); }),
  setImportStatus: publicProcedure.input(z.object({ importId: z.number().int().positive(), status: z.enum(["approved", "archived"]) })).mutation(async ({ ctx, input }) => { const identity = await modulePermission(ctx, "manage"); assertPortalAdministrator(identity); const result = await updateProtheusImportStatus(input.importId, input.status); await recordPortalAudit(identity, "protheus_import", String(input.importId), `status_${input.status}`, { versionName: result?.versionName ?? null }); return { success: true as const, status: input.status }; }),
  importWorkbook: publicProcedure.input(z.object({ fileName: z.string().trim().min(1).max(255), contentBase64: z.string().min(1).max(26_000_000) })).mutation(async ({ ctx, input }) => {
    await modulePermission(ctx, "manage");
    const fileBuffer = Buffer.from(input.contentBase64, "base64");
    if (fileBuffer.byteLength > 18 * 1024 * 1024) throw new Error("A planilha excede o limite de 18 MB.");
    return importProtheusWorkbook(input.fileName, fileBuffer);
  }),
});
