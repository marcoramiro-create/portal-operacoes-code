import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { CatalogEntryUpdate, configureInventoryProduct, createBranch, createCompany, createCostCenter, createOrgUnit, createProductType, createStockLocation, createWarehouse, listInventoryCatalog, setCatalogEntryActive, updateCatalogEntry } from "../inventoryCatalog";
import { getPortalIdentity } from "../supabasePortal";
import { importCatalogEntries } from "../inventoryCatalogImports";

function authorizationHeader(headers: Record<string, string | string[] | undefined>) { const value = headers.authorization; return Array.isArray(value) ? value[0] : value; }
const text = z.string().trim().min(1).max(120);
const optionalText = z.string().trim().max(300).optional();
const catalogEntryUpdateSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("productType"), id: z.string().uuid(), code: text, name: text, description: optionalText, stockControlled: z.boolean() }),
  z.object({ entity: z.literal("orgUnit"), id: z.string().uuid(), code: text, name: text }),
  z.object({ entity: z.literal("costCenter"), id: z.string().uuid(), code: text, name: text, unitId: z.string().uuid().optional() }),
  z.object({ entity: z.literal("company"), id: z.string().uuid(), code: text, legalName: text, tradeName: optionalText, taxId: optionalText }),
  z.object({ entity: z.literal("branch"), id: z.string().uuid(), companyId: z.string().uuid(), code: text, name: text, taxId: optionalText }),
  z.object({ entity: z.literal("warehouse"), id: z.string().uuid(), branchId: z.string().uuid(), code: text, name: text }),
  z.object({ entity: z.literal("stockLocation"), id: z.string().uuid(), warehouseId: z.string().uuid(), code: text, name: text }),
]);

export const inventoryCatalogRouter = router({
  list: publicProcedure.query(async ({ ctx }) => listInventoryCatalog(await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  createProductType: publicProcedure.input(z.object({ code: text, name: text, description: optionalText, stockControlled: z.boolean() })).mutation(async ({ ctx, input }) => createProductType(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  createOrgUnit: publicProcedure.input(z.object({ code: text, name: text })).mutation(async ({ ctx, input }) => createOrgUnit(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  createCostCenter: publicProcedure.input(z.object({ code: text, name: text, unitId: z.string().uuid().optional() })).mutation(async ({ ctx, input }) => createCostCenter(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  createCompany: publicProcedure.input(z.object({ code: text, legalName: text, tradeName: optionalText, taxId: optionalText })).mutation(async ({ ctx, input }) => createCompany(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  createBranch: publicProcedure.input(z.object({ companyId: z.string().uuid(), code: text, name: text, taxId: optionalText })).mutation(async ({ ctx, input }) => createBranch(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  createWarehouse: publicProcedure.input(z.object({ branchId: z.string().uuid(), code: text, name: text })).mutation(async ({ ctx, input }) => createWarehouse(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  createStockLocation: publicProcedure.input(z.object({ warehouseId: z.string().uuid(), code: text, name: text })).mutation(async ({ ctx, input }) => createStockLocation(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  updateEntry: publicProcedure.input(catalogEntryUpdateSchema).mutation(async ({ ctx, input }) => updateCatalogEntry(input as CatalogEntryUpdate, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  setEntryActive: publicProcedure.input(z.object({ entity: z.enum(["productType", "orgUnit", "costCenter", "company", "branch", "warehouse", "stockLocation"]), id: z.string().uuid(), active: z.boolean() })).mutation(async ({ ctx, input }) => setCatalogEntryActive(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  importEntries: publicProcedure.input(z.object({ entity: z.enum(["productType", "orgUnit", "costCenter", "company", "branch", "warehouse", "stockLocation"]), rows: z.array(z.record(z.string(), z.string())).min(1).max(500) })).mutation(async ({ ctx, input }) => importCatalogEntries(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
  configureProduct: publicProcedure.input(z.object({ productId: z.string().uuid(), productTypeId: z.string().uuid(), inventoryControlCategory: z.enum(["consumable", "epi", "uniform", "tool", "other"]), unitOfMeasure: text.max(12), requiresSize: z.boolean(), requiresLot: z.boolean(), requiresExpiration: z.boolean(), requiresCa: z.boolean() })).mutation(async ({ ctx, input }) => configureInventoryProduct(input, await getPortalIdentity(authorizationHeader(ctx.req.headers)))),
});
