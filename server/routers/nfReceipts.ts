import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { createNfReceipt, listRecentNfReceipts } from "../nfReceipts";
import { getPortalIdentity } from "../supabasePortal";

function authorizationHeader(headers: Record<string, string | string[] | undefined>) { const value = headers.authorization; return Array.isArray(value) ? value[0] : value; }

export const nfReceiptsRouter = router({
  recent: publicProcedure.query(async ({ ctx }) => listRecentNfReceipts(await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  capture: publicProcedure.input(z.object({ accessKey: z.string().min(1).max(100), captureMethod: z.enum(["manual", "camera", "barcode_reader"]) })).mutation(async ({ ctx, input }) => createNfReceipt(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
});
