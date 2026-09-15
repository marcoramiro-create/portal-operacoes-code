import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { assertPortalAdministrator, getPortalIdentity } from "./supabasePortal";
import { importCatalogRows } from "./operationalImportService";
import { parseSa2, parseSb1, parseSb5, parseSbz } from "./protheusCatalogParsers";
import { previewCatalogImport } from "./operationalCatalogPreview";
import { previewOperationalImport } from "./operationalSourcePreview";
import { previewOperationMap } from "./operationMapPreview";
function auth(headers: Record<string, string | string[] | undefined>) { const value = headers.authorization; return Array.isArray(value) ? value[0] : value; }
const fileInput = z.object({ fileName: z.string().trim().min(1).max(255), contentBase64: z.string().min(1) });
async function admin(ctx: { req: { headers: Record<string, string | string[] | undefined> } }) { const identity = await getPortalIdentity(auth(ctx.req.headers)); assertPortalAdministrator(identity); }
export const operationalImportRouter = router({
  previewOperationMap: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewOperationMap(input.fileName, content); }),
  previewPurchaseOrders: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewOperationalImport("PEDIDO_COMPRA", input.fileName, content); }),
  previewNfLegal: publicProcedure.input(fileInput.extend({ sourceKind: z.enum(["NF_LEGAL", "NF_NATIVA"]) })).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewOperationalImport(input.sourceKind, input.fileName, content); }),
  previewStockEvolution: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewOperationalImport("FECHAMENTO_ESTOQUE", input.fileName, content); }),
  previewSb1: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewCatalogImport("SB1", input.fileName, content); }),
  previewSbz: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewCatalogImport("SBZ", input.fileName, content); }),
  previewSb5: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewCatalogImport("SB5", input.fileName, content); }),
  previewSa2: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewCatalogImport("SA2", input.fileName, content); }),
  importSb1: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); const parsed = parseSb1(content); return importCatalogRows({ sourceKind: "SB1", fileName: input.fileName, content, rows: parsed.rows }); }),
  importSbz: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); const parsed = parseSbz(content); return importCatalogRows({ sourceKind: "SBZ", fileName: input.fileName, content, rows: parsed.rows }); }),
  importSb5: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); const parsed = parseSb5(content); return importCatalogRows({ sourceKind: "SB5", fileName: input.fileName, content, rows: parsed.rows }); }),
  importSa2: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); const parsed = parseSa2(content); return importCatalogRows({ sourceKind: "SA2", fileName: input.fileName, content, rows: parsed.rows }); }),
});
