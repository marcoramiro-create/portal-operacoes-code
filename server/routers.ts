import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { analyticsRouter } from "./routers/analytics";
import { cadastrosRouter } from "./routers/cadastros";
import { portalRouter } from "./routers/portal";
import { nfReceiptsRouter } from "./routers/nfReceipts";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  analytics: analyticsRouter,
  portal: portalRouter,
  cadastros: cadastrosRouter,
  nfReceipts: nfReceiptsRouter,
});

export type AppRouter = typeof appRouter;
