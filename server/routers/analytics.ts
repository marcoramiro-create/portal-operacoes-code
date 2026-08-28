import { z } from "zod";
import { getAnalyticsDashboard, getAnalyticsEvolution, getAnalyticsFilterOptions, getAnalyticsItems, importProtheusWorkbook, listProtheusImports, type AnalyticsFilter } from "../db";
import { publicProcedure, router } from "../_core/trpc";
import { assertApplicationPermission, assertPortalAdministrator, getPortalIdentity, recordPortalAudit, type PortalIdentity } from "../supabasePortal";
import { updateProtheusImportStatus } from "../db";
import { invokeLLM } from "../_core/llm";
import { validatePurchaseRecommendations, type PurchaseRecommendation } from "../analyticsRules";

const curveSchema = z.enum(["A", "B", "C", "D", "E"]);
function authorizationHeader(headers: Record<string, string | string[] | undefined>) { const value = headers.authorization; return Array.isArray(value) ? value[0] : value; }
async function modulePermission(ctx: { req: { headers: Record<string, string | string[] | undefined> } }, permission: "view" | "manage", nodeKey = "compras-protheus") { const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers)); await assertApplicationPermission(identity, nodeKey, permission); return identity; }
export function canAdministerProtheusImports(identity: Pick<PortalIdentity, "isDevelopmentAdmin" | "profiles">) { return identity.isDevelopmentAdmin || identity.profiles.includes("operations-admin"); }

export const analyticsRouter = router({
  dashboard: publicProcedure.input(z.object({ importId: z.number().int().positive().optional(), branch: z.string().min(1).optional(), curve: curveSchema.optional(), productType: z.enum(["ME", "PE"]).optional(), mrp: z.enum(["Sim", "Não"]).optional(), family: z.string().min(1).optional(), subfamily: z.string().min(1).optional() })).query(async ({ ctx, input }) => { await modulePermission(ctx, "view"); return getAnalyticsDashboard(input); }),
  filterOptions: publicProcedure.input(z.object({ importId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => { await modulePermission(ctx, "view"); return getAnalyticsFilterOptions(input?.importId); }),
  imports: publicProcedure.query(async ({ ctx }) => { await modulePermission(ctx, "view"); return listProtheusImports(); }),
  canAdminister: publicProcedure.query(async ({ ctx }) => { const identity = await modulePermission(ctx, "view"); return canAdministerProtheusImports(identity); }),
  evolution: publicProcedure.input(z.object({ branch: z.string().min(1).optional(), curve: curveSchema.optional(), productType: z.enum(["ME", "PE"]).optional(), mrp: z.enum(["Sim", "Não"]).optional(), family: z.string().min(1).optional(), subfamily: z.string().min(1).optional() })).query(async ({ ctx, input }) => { await modulePermission(ctx, "view"); return getAnalyticsEvolution(input); }),
  items: publicProcedure.input(z.object({ page: z.number().int().min(1).default(1), branch: z.string().min(1).optional(), curve: curveSchema.optional(), productType: z.enum(["ME", "PE"]).optional(), mrp: z.enum(["Sim", "Não"]).optional(), family: z.string().min(1).optional(), subfamily: z.string().min(1).optional() })).query(async ({ ctx, input }) => { await modulePermission(ctx, "view"); const { page, ...filters } = input; return getAnalyticsItems(filters satisfies AnalyticsFilter, page, 50); }),
  aiRecommendations: publicProcedure.input(z.object({ branch: z.string().min(1).optional(), curve: curveSchema.optional(), productType: z.enum(["ME", "PE"]).optional(), mrp: z.enum(["Sim", "Não"]).optional(), family: z.string().min(1).optional(), subfamily: z.string().min(1).optional() })).mutation(async ({ ctx, input }) => {
    await modulePermission(ctx, "view");
    const itemPage = await getAnalyticsItems(input, 1, 50);
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
  setImportStatus: publicProcedure.input(z.object({ importId: z.number().int().positive(), status: z.enum(["approved", "archived"]) })).mutation(async ({ ctx, input }) => { const identity = await modulePermission(ctx, "manage"); assertPortalAdministrator(identity); const result = await updateProtheusImportStatus(input.importId, input.status); try { await recordPortalAudit(identity, "protheus_import", String(input.importId), `status_${input.status}`, { versionName: result?.versionName ?? null }); } catch (error) { console.warn("[Analytics] Status atualizado, mas a auditoria não foi registrada:", error); } return { success: true as const, status: input.status }; }),
  importWorkbook: publicProcedure.input(z.object({ fileName: z.string().trim().min(1).max(255), contentBase64: z.string().min(1).max(26_000_000) })).mutation(async ({ ctx, input }) => {
    await modulePermission(ctx, "manage", "importacoes-compras-protheus");
    const fileBuffer = Buffer.from(input.contentBase64, "base64");
    if (fileBuffer.byteLength > 18 * 1024 * 1024) throw new Error("A planilha excede o limite de 18 MB.");
    return importProtheusWorkbook(input.fileName, fileBuffer);
  }),
});
