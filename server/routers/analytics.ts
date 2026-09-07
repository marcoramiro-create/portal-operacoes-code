import { supabaseStorageGetPresignedPutUrl, supabaseStorageReadBuffer } from "../storage";
import { z } from "zod";
import { getAnalyticsDashboard, getAnalyticsEvolution, getAnalyticsFilterOptions, getAnalyticsItems, importProtheusWorkbook, listProtheusImports, getReferenceCounts, listReferenceImports, deleteReferenceData, deleteProtheusImport, recordReferenceImport, saveReferenceImport, type AnalyticsFilter } from "../db";
import { publicProcedure, router } from "../_core/trpc";
import { assertApplicationPermission, assertPortalAdministrator, getPortalIdentity, recordPortalAudit, type PortalIdentity } from "../supabasePortal";
import { updateProtheusImportStatus } from "../db";
import { invokeLLM } from "../_core/llm";
import { validatePurchaseRecommendations, type PurchaseRecommendation } from "../analyticsRules";
import { importSb1, importSbz, importFamilias, importSubFamilias } from "../referenceImporters";
import { saveSb1References, saveSbzReferences, saveFamilyReferences, saveSubfamilyReferences } from "../db";

const curveSchema = z.enum(["A", "B", "C", "D", "E"]);

function authorizationHeader(headers: Record<string, string | string[] | undefined>) { const value = headers.authorization; return Array.isArray(value) ? value[0] : value; }

async function modulePermission(ctx: { req: { headers: Record<string, string | string[] | undefined> } }, permission: "view" | "manage", nodeKey = "compras-protheus") { const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers)); await assertApplicationPermission(identity, nodeKey, permission); return identity; }

export function canAdministerProtheusImports(identity: Pick<PortalIdentity, "isDevelopmentAdmin" | "profiles">) { return identity.isDevelopmentAdmin || identity.profiles.includes("operations-admin"); }

// MUDANÇA (07/09/2026): os importadores de referência agora devolvem índices
// (Sb1Index/SbzIndex/Map). Estas funções convertem essa saída em ARRAYS simples
// de registros, no formato exato que o saveReferenceImport/save*References do
// db.ts esperam gravar. Sem essa conversão, o save recebia um objeto (não um
// array), records.length ficava undefined, nada era gravado e o histórico
// registrava "0 registros".

function sb1ParaRegistros(buffer: Buffer): { code: string; tipo: string; familiaCode: string; subfamiliaCode: string }[] {
  const idx = importSb1(buffer);
  return idx.registros
    .filter(r => r.code && r.code !== "0")
    .map(r => ({ code: r.code, tipo: r.tipo, familiaCode: r.familiaCode, subfamiliaCode: r.subfamiliaCode }));
}

function sbzParaRegistros(buffer: Buffer): { chave: string; code: string; filial: string; estoqMin: number | null; estoqMax: number | null; entraMrp: string }[] {
  const idx = importSbz(buffer);
  return Array.from(idx.porChave.values())
    .filter(r => r.chave)
    .map(r => ({ chave: r.chave, code: r.codigo, filial: r.filial, estoqMin: r.estoqMin, estoqMax: r.estoqMax, entraMrp: r.entraMrp }));
}

function familiasParaRegistros(buffer: Buffer): { code: string; descricao: string }[] {
  const mapa = importFamilias(buffer);
  return Array.from(mapa.entries())
    .filter(([code]) => code && code !== "0")
    .map(([code, descricao]) => ({ code, descricao }));
}

function subFamiliasParaRegistros(buffer: Buffer): { code: string; descricao: string }[] {
  const mapa = importSubFamilias(buffer);
  return Array.from(mapa.entries())
    .filter(([code]) => code && code !== "0")
    .map(([code, descricao]) => ({ code, descricao }));
}

export const analyticsRouter = router({
  dashboard: publicProcedure.input(z.object({ importId: z.number().int().positive().optional(), branch: z.string().min(1).optional(), curve: curveSchema.optional(), productType: z.enum(["ME", "PE"]).optional(), mrp: z.enum(["Sim", "Não"]).optional(), family: z.string().min(1).optional(), subfamily: z.string().min(1).optional() })).query(async ({ ctx, input }) => { await modulePermission(ctx, "view"); return getAnalyticsDashboard(input); }),
  filterOptions: publicProcedure.input(z.object({ importId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => { await modulePermission(ctx, "view"); return getAnalyticsFilterOptions(input?.importId); }),
  imports: publicProcedure.query(async ({ ctx }) => { await modulePermission(ctx, "view"); return listProtheusImports(); }),
  canAdminister: publicProcedure.query(async ({ ctx }) => { const identity = await modulePermission(ctx, "view"); return canAdministerProtheusImports(identity); }),
  referenceCounts: publicProcedure.query(async ({ ctx }) => { await modulePermission(ctx, "view"); return getReferenceCounts(); }),
  referenceImportHistory: publicProcedure.query(async ({ ctx }) => { await modulePermission(ctx, "view"); return listReferenceImports(); }),
  evolution: publicProcedure.input(z.object({ branch: z.string().min(1).optional(), curve: curveSchema.optional(), productType: z.enum(["ME", "PE"]).optional(), mrp: z.enum(["Sim", "Não"]).optional(), family: z.string().min(1).optional(), subfamily: z.string().min(1).optional() })).query(async ({ ctx, input }) => { await modulePermission(ctx, "view"); return getAnalyticsEvolution(input); }),
  items: publicProcedure.input(z.object({ page: z.number().int().min(1).default(1), branch: z.string().min(1).optional(), curve: curveSchema.optional(), productType: z.enum(["ME", "PE"]).optional(), mrp: z.enum(["Sim", "Não"]).optional(), family: z.string().min(1).optional(), subfamily: z.string().min(1).optional() })).query(async ({ ctx, input }) => { await modulePermission(ctx, "view"); const { page, ...filters } = input; return getAnalyticsItems(filters satisfies AnalyticsFilter, page, 50); }),
  aiRecommendations: publicProcedure.input(z.object({ page: z.number().int().min(1).default(1), branch: z.string().min(1).optional(), curve: curveSchema.optional(), productType: z.enum(["ME", "PE"]).optional(), mrp: z.enum(["Sim", "Não"]).optional(), family: z.string().min(1).optional(), subfamily: z.string().min(1).optional() })).mutation(async ({ ctx, input }) => {
    await modulePermission(ctx, "view");
    const { page, ...filters } = input;
    const itemPage = await getAnalyticsItems(filters, page, 50);
    if (!itemPage.items.length) return { generatedAt: new Date(), total: 0, recommendations: [] };
    const payload = itemPage.items.map(item => ({ code: item.code, description: item.description, branch: item.branch, productType: item.productType, mrp: item.mrp, family: item.family || "Não informado", subfamily: item.subfamily || "Não informado", curve: item.curve, sales13M: item.sales13M, salesValue13M: item.salesValue13M, stock: item.stock, stockValue: item.stockValue, coverageDays: item.coverageDays, excessValue: item.excessValue, turnover: item.turnover }));
    const response = await invokeLLM({ messages: [
      { role: "system", content: "Você é um especialista sênior em supply chain e planejamento de materiais. Analise somente os dados fornecidos. Para cada item, recomende uma ação: comprar, pausar/reduzir compras ou acompanhar. Não invente demanda, prazo, fornecedor ou dados ausentes. Use regras transparentes: baixa cobertura pode justificar compra, estoque sem vendas ou excedente pode justificar pausa/redução, e sinais conflitantes devem virar acompanhamento. Retorne exclusivamente JSON conforme o schema." },
      { role: "user", content: JSON.stringify({ objetivo: "Recomendação operacional de compras para os itens atualmente filtrados", itens: payload }) },
    ], response_format: { type: "json_schema", json_schema: { name: "purchase_recommendations", strict: true, schema: { type: "object", properties: { recommendations: { type: "array", items: { type: "object", properties: { code: { type: "string" }, action: { type: "string", enum: ["comprar", "pausar/reduzir", "acompanhar"] }, confidence: { type: "string", enum: ["alta", "média", "baixa"] }, rationale: { type: "string" } }, required: ["code", "action", "confidence", "rationale"], additionalProperties: false } } }, required: ["recommendations"], additionalProperties: false } } }, maxTokens: 12000 });
    const rawContent = response.choices[0]?.message?.content;
    const text = typeof rawContent === "string" ? rawContent : Array.isArray(rawContent) ? rawContent.map(part => typeof part === "string" ? part : "text" in part ? part.text : "").join("") : "";
    const parsed = JSON.parse(text) as { recommendations: PurchaseRecommendation[] };
    const recommendations = validatePurchaseRecommendations(parsed.recommendations, new Set(itemPage.items.map(item => item.code)));
    return { generatedAt: new Date(), total: itemPage.items.length, recommendations };
  }),
  // MUDANÇA (07/09/2026): upload direto ao armazenamento para arquivos grandes.
  getUploadUrl: publicProcedure.input(z.object({ fileName: z.string().min(1).max(255) })).mutation(async ({ ctx, input }) => {
    await modulePermission(ctx, "manage", "importacoes-compras-protheus");
    return supabaseStorageGetPresignedPutUrl(`protheus-imports/${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
  }),
  processWorkbook: publicProcedure.input(z.object({ fileName: z.string().min(1).max(255), key: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    await modulePermission(ctx, "manage", "importacoes-compras-protheus");
    const buffer = await supabaseStorageReadBuffer(input.key);
    const result = await importProtheusWorkbook(input.fileName, buffer);
    return { ...result, versionName: input.fileName.replace(/\.xlsx$/i, "") };
  }),
  // MUDANÇA (07/09/2026): importação em transação única (apaga + grava + histórico).
  // MUDANÇA (07/09/2026): os importadores devolvem índices — agora convertidos em
  // arrays simples antes do saveReferenceImport (corrige "0 registros").
  processReference: publicProcedure.input(z.object({ kind: z.enum(["sb1", "sbz", "familias", "subfamilias"]), fileName: z.string().min(1).max(255), key: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    await modulePermission(ctx, "manage", "importacoes-compras-protheus");
    const buffer = await supabaseStorageReadBuffer(input.key);
    let count = 0;
    if (input.kind === "sb1") count = await saveReferenceImport("sb1", input.fileName, sb1ParaRegistros(buffer));
    else if (input.kind === "sbz") count = await saveReferenceImport("sbz", input.fileName, sbzParaRegistros(buffer));
    else if (input.kind === "familias") count = await saveReferenceImport("familias", input.fileName, familiasParaRegistros(buffer));
    else count = await saveReferenceImport("subfamilias", input.fileName, subFamiliasParaRegistros(buffer));
    return { count };
  }),
  // MUDANÇA (07/09/2026): exclusão direto na tela, sem SQL.
  deleteReference: publicProcedure.input(z.object({ kind: z.enum(["sb1", "sbz", "familias", "subfamilias"]) })).mutation(async ({ ctx, input }) => { await modulePermission(ctx, "manage", "importacoes-compras-protheus"); await deleteReferenceData(input.kind); return { success: true as const }; }),
  deleteImport: publicProcedure.input(z.object({ importId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const identity = await modulePermission(ctx, "manage", "importacoes-compras-protheus"); assertPortalAdministrator(identity); await deleteProtheusImport(input.importId); return { success: true as const }; }),
  setImportStatus: publicProcedure.input(z.object({ importId: z.number().int().positive(), status: z.enum(["approved", "archived"]) })).mutation(async ({ ctx, input }) => { const identity = await modulePermission(ctx, "manage"); assertPortalAdministrator(identity); const result = await updateProtheusImportStatus(input.importId, input.status); try { await recordPortalAudit(identity, "protheus_import", String(input.importId), `status_${input.status}`, { versionName: result?.versionName ?? null }); } catch (error) { console.warn("[Analytics] Status atualizado, mas a auditoria não foi registrada:", error); } return { success: true as const, status: input.status }; }),
  // Rotas legadas (base64) — também convertidas para gravar os arrays corretos.
  importWorkbook: publicProcedure.input(z.object({ fileName: z.string().trim().min(1).max(255), contentBase64: z.string().min(1).max(26_000_000) })).mutation(async ({ ctx, input }) => {
    await modulePermission(ctx, "manage", "importacoes-compras-protheus");
    const fileBuffer = Buffer.from(input.contentBase64, "base64");
    if (fileBuffer.byteLength > 18 * 1024 * 1024) throw new Error("A planilha excede o limite de 18 MB.");
    return importProtheusWorkbook(input.fileName, fileBuffer);
  }),
  importReferenceSb1: publicProcedure.input(z.object({ contentBase64: z.string().min(1).max(26_000_000) })).mutation(async ({ ctx, input }) => {
    await modulePermission(ctx, "manage", "importacoes-compras-protheus");
    const buffer = Buffer.from(input.contentBase64, "base64");
    const count = await saveSb1References(sb1ParaRegistros(buffer));
    return { count };
  }),
  importReferenceSbz: publicProcedure.input(z.object({ contentBase64: z.string().min(1).max(26_000_000) })).mutation(async ({ ctx, input }) => {
    await modulePermission(ctx, "manage", "importacoes-compras-protheus");
    const buffer = Buffer.from(input.contentBase64, "base64");
    const count = await saveSbzReferences(sbzParaRegistros(buffer));
    return { count };
  }),
  importReferenceFamilias: publicProcedure.input(z.object({ contentBase64: z.string().min(1).max(26_000_000) })).mutation(async ({ ctx, input }) => {
    await modulePermission(ctx, "manage", "importacoes-compras-protheus");
    const buffer = Buffer.from(input.contentBase64, "base64");
    const count = await saveFamilyReferences(familiasParaRegistros(buffer));
    return { count };
  }),
  importReferenceSubFamilias: publicProcedure.input(z.object({ contentBase64: z.string().min(1).max(26_000_000) })).mutation(async ({ ctx, input }) => {
    await modulePermission(ctx, "manage", "importacoes-compras-protheus");
    const buffer = Buffer.from(input.contentBase64, "base64");
    const count = await saveSubfamilyReferences(subFamiliasParaRegistros(buffer));
    return { count };
  }),
});