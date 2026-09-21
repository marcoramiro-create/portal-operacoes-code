import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { analyticsRouter } from "./routers/analytics";
import { cadastrosRouter } from "./routers/cadastros";
import { portalRouter } from "./routers/portal";
import { nfReceiptsRouter } from "./routers/nfReceipts";
import { inventoryCatalogRouter } from "./routers/inventoryCatalog";
import { inventoryOperationsRouter } from "./routers/inventoryOperations";
import { inventoryToolsRouter } from "./routers/inventoryTools";
import { assetMaintenanceRouter } from "./routers/assetMaintenance";
import { costEvolutionRouter } from "./routers/costEvolution";
import { epiRouter } from "./routers/epi";
import { operationalImportRouter } from "./operationalImportRouter";
import { operationalAuditRouter } from "./routers/operationalAudit";
import { auditBacklogRouter } from "./routers/auditBacklog";
import { loginWithPortalPassword, revokePortalSession, setPasswordFromResetToken } from "./portalAuthService";
import { z } from "zod";

function requestInfo(ctx: { req: { ip?: string; headers: Record<string, string | string[] | undefined> } }) {
  const userAgent = ctx.req.headers["user-agent"];
  return { ip: ctx.req.ip, userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    login: publicProcedure.input(z.object({ email: z.string().email(), password: z.string().min(1) })).mutation(async ({ ctx, input }) => {
      const session = await loginWithPortalPassword(input.email, input.password, requestInfo(ctx));
      ctx.res.cookie(COOKIE_NAME, session.token, { ...getSessionCookieOptions(ctx.req), maxAge: session.expiresAt.getTime() - Date.now() });
      return { success: true as const };
    }),
    me: publicProcedure.query(opts => opts.ctx.user),
    setPassword: publicProcedure.input(z.object({ token: z.string().min(40), password: z.string().min(12) })).mutation(async ({ input }) => { await setPasswordFromResetToken(input.token, input.password); return { success: true as const }; }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookieHeader = ctx.req.headers.cookie;
      const token = cookieHeader?.split(";").map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
      if (token) await revokePortalSession(token);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  analytics: analyticsRouter,
  portal: portalRouter,
  cadastros: cadastrosRouter,
  nfReceipts: nfReceiptsRouter,
  inventoryCatalog: inventoryCatalogRouter,
  inventoryOperations: inventoryOperationsRouter,
  inventoryTools: inventoryToolsRouter,
  assetMaintenance: assetMaintenanceRouter,
  costEvolution: costEvolutionRouter,
  epi: epiRouter,
  operationalImport: operationalImportRouter,
  operationalAudit: operationalAuditRouter,
  auditBacklog: auditBacklogRouter,
});

export type AppRouter = typeof appRouter;
