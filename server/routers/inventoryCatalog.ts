import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { configureInventoryProduct, createBranch, createCompany, createProductType, createStockLocation, createWarehouse, listInventoryCatalog } from "../inventoryCatalog";
import { getPortalIdentity } from "../supabasePortal";

function authorizationHeader(headers: Record<string, string | string[] | undefined>) { const value = headers.authorization; return Array.isArray(value) ? value[0] : value; }
const text = z.string().trim().min(1).max(120);
const optionalText = z.string().trim().max(300).optional();

export const inventoryCatalogRouter = router({
  list: publicProcedure.query(async ({ ctx }) => listInventoryCatalog(await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  createProductType: publicProcedure.input(z.object({ code: text, name: text, description: optionalText, stockControlled: z.boolean() })).mutation(async ({ ctx, input }) => createProductType(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  createCompany: publicProcedure.input(z.object({ code: text, legalName: text, tradeName: optionalText, taxId: optionalText })).mutation(async ({ ctx, input }) => createCompany(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  createBranch: publicProcedure.input(z.object({ companyId: z.string().uuid(), code: text, name: text, taxId: optionalText })).mutation(async ({ ctx, input }) => createBranch(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  createWarehouse: publicProcedure.input(z.object({ branchId: z.string().uuid(), code: text, name: text })).mutation(async ({ ctx, input }) => createWarehouse(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  createStockLocation: publicProcedure.input(z.object({ warehouseId: z.string().uuid(), code: text, name: text })).mutation(async ({ ctx, input }) => createStockLocation(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  configureProduct: publicProcedure.input(z.object({ productId: z.string().uuid(), productTypeId: z.string().uuid(), unitOfMeasure: text.max(12), requiresSize: z.boolean(), requiresLot: z.boolean(), requiresExpiration: z.boolean(), requiresCa: z.boolean() })).mutation(async ({ ctx, input }) => configureInventoryProduct(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
});
