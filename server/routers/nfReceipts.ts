import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { READING_POINTS, createNfReceipt, listNfReceiptsForExport, listRecentNfReceipts, softDeleteNfReceipt, updateNfReceiptReadingPoint } from "../nfReceipts";
import { getPortalIdentity } from "../supabasePortal";
function authorizationHeader(headers: Record<string, string | string[] | undefined>) { const value = headers.authorization; return Array.isArray(value) ? value[0] : value; }
export const nfReceiptsRouter = router({
  recent: publicProcedure.query(async ({ ctx }) => listRecentNfReceipts(await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  exportRows: publicProcedure.query(async ({ ctx }) => listNfReceiptsForExport(await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  capture: publicProcedure.input(z.object({
    accessKey: z.string().min(1).max(100),
    captureMethod: z.enum(["manual", "camera", "barcode_reader"]),
    readingPoint: z.enum(READING_POINTS),
    carrierId: z.string().uuid().nullable().optional(),
    carrierName: z.string().max(200).nullable().optional(),
    vehiclePlate: z.string().max(12).nullable().optional(),
  })).mutation(async ({ ctx, input }) => createNfReceipt(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  updateReadingPoint: publicProcedure.input(z.object({
    id: z.string().min(1),
    readingPoint: z.enum(READING_POINTS),
    reason: z.string().min(1),
  })).mutation(async ({ ctx, input }) => updateNfReceiptReadingPoint(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  remove: publicProcedure.input(z.object({
    id: z.string().min(1),
    reason: z.string().min(1),
  })).mutation(async ({ ctx, input }) => softDeleteNfReceipt(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
});