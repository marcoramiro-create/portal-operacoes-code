import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { importCarriers, listActiveCarriers } from "../carriers";
import { getPortalIdentity } from "../supabasePortal";

function authorizationHeader(headers: Record<string, string | string[] | undefined>) {
  const value = headers.authorization;
  return Array.isArray(value) ? value[0] : value;
}

export const carriersRouter = router({
  list: publicProcedure.query(async ({ ctx }) => listActiveCarriers(await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  import: publicProcedure.input(z.object({
    rows: z.array(z.object({
      code: z.string().optional(),
      name: z.string(),
      cnpj: z.string().optional(),
      city: z.string().optional(),
      uf: z.string().optional(),
    })),
    sourceFileName: z.string().optional(),
  })).mutation(async ({ ctx, input }) => importCarriers(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
});