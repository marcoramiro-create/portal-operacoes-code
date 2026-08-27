import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { createRequisition, fulfillRequisition, inventoryContext, listRecentMovements, listRequisitions, postStockEntry, postTransfer, requisitionLines, stockPosition } from "../inventoryOperations";
import { getPortalIdentity } from "../supabasePortal";

function authorizationHeader(headers: Record<string, string | string[] | undefined>) { const value = headers.authorization; return Array.isArray(value) ? value[0] : value; }
const operationLine = z.object({ productId: z.string().uuid(), quantity: z.number().finite().positive(), sizeCode: z.string().trim().max(40).optional() });

export const inventoryOperationsRouter = router({
  context: publicProcedure.query(async ({ ctx }) => inventoryContext(await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  requisitions: publicProcedure.query(async ({ ctx }) => listRequisitions(await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  requisitionLines: publicProcedure.input(z.object({ requisitionId: z.string().uuid() })).query(async ({ ctx, input }) => requisitionLines(input.requisitionId, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  stockPosition: publicProcedure.query(async ({ ctx }) => stockPosition(await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  recentMovements: publicProcedure.query(async ({ ctx }) => listRecentMovements(await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  createRequisition: publicProcedure.input(z.object({ sourceWarehouseId: z.string().uuid().optional(), scheduledAt: z.string().datetime().optional(), notes: z.string().trim().max(1000).optional(), lines: z.array(operationLine).min(1).max(100) })).mutation(async ({ ctx, input }) => createRequisition(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  postEntry: publicProcedure.input(z.object({ type: z.enum(["purchase_receipt", "inventory_initial", "inventory_adjustment"]), destinationLocationId: z.string().uuid(), nfReceiptId: z.string().uuid().optional(), reason: z.string().trim().max(500).optional(), notes: z.string().trim().max(1000).optional(), lines: z.array(operationLine).min(1).max(100) })).mutation(async ({ ctx, input }) => postStockEntry(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  postTransfer: publicProcedure.input(z.object({ sourceLocationId: z.string().uuid(), destinationLocationId: z.string().uuid(), notes: z.string().trim().max(1000).optional(), lines: z.array(operationLine).min(1).max(100) })).mutation(async ({ ctx, input }) => postTransfer(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  fulfillRequisition: publicProcedure.input(z.object({ requisitionId: z.string().uuid(), sourceLocationId: z.string().uuid(), notes: z.string().trim().max(1000).optional(), lines: z.array(operationLine).min(1).max(100) })).mutation(async ({ ctx, input }) => fulfillRequisition(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
});
