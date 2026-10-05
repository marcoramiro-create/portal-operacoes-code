import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "./_core/trpc";
import { applicationPermissionsForUser, assertPortalAdministrator, getPortalIdentity, type PortalIdentity } from "./supabasePortal";
import { importCatalogRows, importOperationalRows } from "./operationalImportService";
import { parseSa2, parseSb1, parseSb5, parseSbz } from "./protheusCatalogParsers";
import { parseMaterialEntries, parseStockEvolution } from "./operationalSourceParsers";
import { previewCatalogImport } from "./operationalCatalogPreview";
import { previewOperationalImport } from "./operationalSourcePreview";
import { previewOperationMap } from "./operationMapPreview";
import { obterCurvaIndustriaAtual, recalcularCurvaIndustria } from "./industryCurveService";
function auth(headers: Record<string, string | string[] | undefined>) { const value = headers.authorization; return Array.isArray(value) ? value[0] : value; }
const fileInput = z.object({ fileName: z.string().trim().min(1).max(255), contentBase64: z.string().min(1) });
async function admin(ctx: { req: { headers: Record<string, string | string[] | undefined> } }) { const identity = await getPortalIdentity(auth(ctx.req.headers)); assertPortalAdministrator(identity); }
// ----- PERMISSÃO Curva ABC da Indústria (01/10/2026) -----
// Mesmo padrão do Recebimento NF: aceita o nó "curva-abc-industria" OU o PAI
// "suprimentos-estoques" (regra pai-libera-filho também no servidor).
async function curvaIndustriaPermissions(identity: PortalIdentity) {
  const [child, parent] = await Promise.all([
    applicationPermissionsForUser(identity, "curva-abc-industria"),
    applicationPermissionsForUser(identity, "suprimentos-estoques"),
  ]);
  return { view: child.view || parent.view, manage: child.manage || parent.manage, approve: child.approve || parent.approve };
}
async function assertCurvaIndustriaPermission(identity: PortalIdentity, permission: "view" | "manage") {
  if (identity.isDevelopmentAdmin) return;
  const permissions = await curvaIndustriaPermissions(identity);
  if (!permissions[permission]) throw new TRPCError({ code: "FORBIDDEN", message: "Seu usuário não possui o nível de acesso necessário neste módulo." });
}
export const operationalImportRouter = router({
  previewOperationMap: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewOperationMap(input.fileName, content); }),
  previewPurchaseOrders: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewOperationalImport("PEDIDO_COMPRA", input.fileName, content); }),
  previewNfLegal: publicProcedure.input(fileInput.extend({ sourceKind: z.enum(["NF_LEGAL", "NF_NATIVA"]) })).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewOperationalImport(input.sourceKind, input.fileName, content); }),
  previewStockEvolution: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewOperationalImport("FECHAMENTO_ESTOQUE", input.fileName, content); }),
  previewMaterialEntries: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewOperationalImport("ENTRADA_NF", input.fileName, content); }),
  previewSb1: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewCatalogImport("SB1", input.fileName, content); }),
  previewSbz: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewCatalogImport("SBZ", input.fileName, content); }),
  previewSb5: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewCatalogImport("SB5", input.fileName, content); }),
  previewSa2: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); return previewCatalogImport("SA2", input.fileName, content); }),
  importSb1: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); const parsed = parseSb1(content); return importCatalogRows({ sourceKind: "SB1", fileName: input.fileName, content, rows: parsed.rows }); }),
  importSbz: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); const parsed = parseSbz(content); return importCatalogRows({ sourceKind: "SBZ", fileName: input.fileName, content, rows: parsed.rows }); }),
  importSb5: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); const parsed = parseSb5(content); return importCatalogRows({ sourceKind: "SB5", fileName: input.fileName, content, rows: parsed.rows }); }),
  importSa2: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); const parsed = parseSa2(content); return importCatalogRows({ sourceKind: "SA2", fileName: input.fileName, content, rows: parsed.rows }); }),
  importStockEvolution: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => {
    await admin(ctx);
    const content = Buffer.from(input.contentBase64, "base64");
    const parsed = parseStockEvolution(content);
    const imported = await importOperationalRows({ sourceKind: "FECHAMENTO_ESTOQUE", fileName: input.fileName, content, rows: parsed.rows });
    // DECISÃO 01/10/2026: recálculo automático da Curva ABC Indústria APÓS
    // importar FECHAMENTO_ESTOQUE (além do botão manual). Se faltar ENTRADA_NF
    // ou SB1/SBZ em uso, o import não falha — apenas avisa.
    try {
      const curva = await recalcularCurvaIndustria();
      return { ...imported, curva };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Curva ABC da Indústria não calculada.";
      return { ...imported, curva: null, curvaErro: msg };
    }
  }),
  importMaterialEntries: publicProcedure.input(fileInput).mutation(async ({ ctx, input }) => { await admin(ctx); const content = Buffer.from(input.contentBase64, "base64"); const parsed = parseMaterialEntries(content); return importOperationalRows({ sourceKind: "ENTRADA_NF", fileName: input.fileName, content, rows: parsed.rows }); }),
  // Botão manual "Recalcular curva" — exige permissão de GERENCIAR no módulo (ou admin)
  recalcularCurvaIndustria: publicProcedure.mutation(async ({ ctx }) => {
    const identity = await getPortalIdentity(auth(ctx.req.headers));
    await assertCurvaIndustriaPermission(identity, "manage");
    return recalcularCurvaIndustria();
  }),
  // Leitura da curva corrente (tela Curva ABC da Indústria) — exige permissão de VISUALIZAR no módulo (ou admin)
  curvaIndustriaAtual: publicProcedure.query(async ({ ctx }) => {
    const identity = await getPortalIdentity(auth(ctx.req.headers));
    await assertCurvaIndustriaPermission(identity, "view");
    return obterCurvaIndustriaAtual();
  }),
});
