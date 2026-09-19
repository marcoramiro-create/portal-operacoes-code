import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { assertPortalAdministrator, getPortalIdentity } from "../supabasePortal";
import { getBacklogKpis, listAuditFindings, syncAuditFindings, upsertAuditTreatment } from "../auditBacklogService";

function authorizationHeader(headers: Record<string, string | string[] | undefined>) { const value = headers.authorization; return Array.isArray(value) ? value[0] : value; }
async function administrator(ctx: { req: { headers: Record<string, string | string[] | undefined> } }) { const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers)); assertPortalAdministrator(identity); return identity; }
const treatment = z.object({ findingId: z.string().uuid(), status: z.enum(["aberto", "em_tratativa", "resolvido", "ignorado"]), priority: z.enum(["alta", "media", "baixa"]), responsibleName: z.string().trim().max(160), dueDate: z.string().date().nullable().optional(), note: z.string().max(2000).optional() });
export const auditBacklogRouter = router({
  kpis: publicProcedure.query(async ({ ctx }) => { await administrator(ctx); return getBacklogKpis(); }),
  findings: publicProcedure.input(z.object({ status: z.enum(["aberto", "em_tratativa", "resolvido", "ignorado"]).optional(), source: z.string().trim().max(80).optional(), category: z.enum(["EXCECAO", "DUPLICIDADE"]).optional(), limit: z.number().int().min(1).max(200).default(50), offset: z.number().int().min(0).default(0) })).query(async ({ ctx, input }) => { await administrator(ctx); return listAuditFindings(input); }),
  sync: publicProcedure.mutation(async ({ ctx }) => { const identity = await administrator(ctx); return syncAuditFindings(identity); }),
  upsertTreatment: publicProcedure.input(treatment).mutation(async ({ ctx, input }) => { const identity = await administrator(ctx); return upsertAuditTreatment(input, identity); }),
});
