import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { assignTool, createToolInstance, listToolInstances, returnTool, toolsContext } from "../inventoryOperations";
import { getPortalIdentity } from "../supabasePortal";

function authorizationHeader(headers: Record<string, string | string[] | undefined>) { const value = headers.authorization; return Array.isArray(value) ? value[0] : value; }
const condition = z.enum(["new", "good", "fair", "damaged", "maintenance", "lost", "retired"]);

export const inventoryToolsRouter = router({
  context: publicProcedure.query(async ({ ctx }) => toolsContext(await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  list: publicProcedure.query(async ({ ctx }) => listToolInstances(await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  create: publicProcedure.input(z.object({ productId: z.string().uuid(), instanceCode: z.string().trim().min(1).max(100), locationId: z.string().uuid(), conditionState: condition })).mutation(async ({ ctx, input }) => createToolInstance(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  assign: publicProcedure.input(z.object({ toolId: z.string().uuid(), employeeId: z.string().uuid(), notes: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => assignTool(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  return: publicProcedure.input(z.object({ toolId: z.string().uuid(), locationId: z.string().uuid(), conditionState: condition, notes: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => returnTool(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
});
