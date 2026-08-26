import { z } from "zod";
import { isRegistrationType, registrationTypes } from "../../shared/registrationLayouts";
import { assertPortalAdministrator, getPortalIdentity } from "../supabasePortal";
import { commitRegistrationImport, previewRegistrationImport } from "../registrationImports";
import { publicProcedure, router } from "../_core/trpc";

const typeSchema = z.enum(registrationTypes);
const rowsSchema = z.array(z.record(z.string(), z.string())).min(1).max(500);

function authorizationHeader(headers: Record<string, string | string[] | undefined>) { const value = headers.authorization; return Array.isArray(value) ? value[0] : value; }
async function administrator(ctx: { req: { headers: Record<string, string | string[] | undefined> } }) { const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers)); assertPortalAdministrator(identity); return identity; }

export const cadastrosRouter = router({
  previewImport: publicProcedure.input(z.object({ type: typeSchema, rows: rowsSchema })).mutation(async ({ ctx, input }) => { await administrator(ctx); return previewRegistrationImport(input.type, input.rows); }),
  commitImport: publicProcedure.input(z.object({ type: typeSchema, rows: rowsSchema })).mutation(async ({ ctx, input }) => { const identity = await administrator(ctx); return commitRegistrationImport(input.type, input.rows, identity); }),
});
