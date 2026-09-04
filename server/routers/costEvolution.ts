import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { previewCostEvolutionWorkbook } from "../costEvolution";
import { commitCostEvolutionImport, getCostEvolutionFilterOptions, getCostEvolutionItems, getCostEvolutionSummary, listCostEvolutionImports, updateCostEvolutionImportStatus } from "../costEvolutionService";
import { assertApplicationPermission, getPortalIdentity, listObservacoes, recordPortalAudit, upsertObservacao } from "../supabasePortal";
import { getCodAgregados, getCostEvolutionAnalise, getFiliais, getPeriodos } from "../costEvolutionAnalise";

function authorizationHeader(headers: Record<string, string | string[] | undefined>) {
  const value = headers.authorization;
  return Array.isArray(value) ? value[0] : value;
}

const segment = z.enum(["auto_parts", "industry"]);
const importerNode = (value: "auto_parts" | "industry") => value === "auto_parts" ? "importacoes-custos-autopecas" : "importacoes-custos-industria";
const dashboardNode = (value: "auto_parts" | "industry") => value === "auto_parts" ? "custos-autopecas" : "custos-industria";
const filters = z.object({
  segment,
  branch: z.string().trim().max(24).optional(),
  mrp: z.enum(["Sim", "Não"]).optional(),
  buyer: z.string().trim().max(320).optional(),
  search: z.string().trim().max(255).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(10).max(100).optional(),
});
const analiseFilters = z.object({
  segment,
  periodoInicio: z.string().trim().max(7).optional(),
  periodoFim: z.string().trim().max(7).optional(),
  filial: z.string().trim().max(24).optional(),
  codAgregado: z.string().trim().max(120).optional(),
  descricao: z.string().trim().max(255).optional(),
});

export const costEvolutionRouter = router({
  preview: publicProcedure.input(z.object({ segment, fileName: z.string().trim().min(1).max(255), contentBase64: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    await assertApplicationPermission(identity, importerNode(input.segment), "manage");
    return previewCostEvolutionWorkbook(input.fileName, Buffer.from(input.contentBase64, "base64"), input.segment);
  }),
  commit: publicProcedure.input(z.object({ segment, fileName: z.string().trim().min(1).max(255), contentBase64: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    await assertApplicationPermission(identity, importerNode(input.segment), "manage");
    const result = await commitCostEvolutionImport({ ...input, importedBy: identity.email });
    await recordPortalAudit(identity, "cost_evolution_import", String(result.id), "created", { segment: input.segment, fileName: input.fileName, itemCount: result.itemCount, observationCount: result.observationCount });
    return result;
  }),
  imports: publicProcedure.input(z.object({ segment })).query(async ({ ctx, input }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    await assertApplicationPermission(identity, importerNode(input.segment), "view");
    return listCostEvolutionImports(input.segment);
  }),
  updateStatus: publicProcedure.input(z.object({ id: z.number().int().positive(), segment, status: z.enum(["approved", "archived"]) })).mutation(async ({ ctx, input }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    await assertApplicationPermission(identity, importerNode(input.segment), "approve");
    const result = await updateCostEvolutionImportStatus(input.id, input.status);
    await recordPortalAudit(identity, "cost_evolution_import", String(input.id), input.status, { segment: input.segment });
    return result;
  }),
  filterOptions: publicProcedure.input(z.object({ segment })).query(async ({ ctx, input }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    await assertApplicationPermission(identity, dashboardNode(input.segment), "view");
    return getCostEvolutionFilterOptions(input.segment);
  }),
  summary: publicProcedure.input(filters).query(async ({ ctx, input }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    await assertApplicationPermission(identity, dashboardNode(input.segment), "view");
    return getCostEvolutionSummary(input);
  }),
  items: publicProcedure.input(filters).query(async ({ ctx, input }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    await assertApplicationPermission(identity, dashboardNode(input.segment), "view");
    return getCostEvolutionItems(input);
  }),
  analise: publicProcedure.input(analiseFilters).query(async ({ ctx, input }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    await assertApplicationPermission(identity, dashboardNode(input.segment), "view");
    return getCostEvolutionAnalise({
      segment: input.segment,
      periodoInicio: input.periodoInicio,
      periodoFim: input.periodoFim,
      filial: input.filial,
      codAgregado: input.codAgregado,
      descricao: input.descricao,
    });
  }),
  filiais: publicProcedure.input(z.object({ segment })).query(async ({ ctx, input }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    await assertApplicationPermission(identity, dashboardNode(input.segment), "view");
    return getFiliais();
  }),
  codAgregados: publicProcedure.input(z.object({ segment })).query(async ({ ctx, input }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    await assertApplicationPermission(identity, dashboardNode(input.segment), "view");
    return getCodAgregados();
  }),
  periodos: publicProcedure.input(z.object({ segment })).query(async ({ ctx, input }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    await assertApplicationPermission(identity, dashboardNode(input.segment), "view");
    return getPeriodos();
  }),
  salvarObservacao: publicProcedure.input(z.object({ segment, codigo: z.string().trim().min(1).max(120), filial: z.string().trim().min(1).max(24), period: z.string().trim().min(1).max(7), observacao: z.string().trim().max(2000).nullable() })).mutation(async ({ ctx, input }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    await assertApplicationPermission(identity, dashboardNode(input.segment), "view");
    return upsertObservacao({ codigo: input.codigo, filial: input.filial, period: input.period, observacao: input.observacao }, identity);
  }),
  observacoes: publicProcedure.input(z.object({ segment, period: z.string().trim().min(1).max(7) })).query(async ({ ctx, input }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    await assertApplicationPermission(identity, dashboardNode(input.segment), "view");
    return listObservacoes(input.period, identity);
  }),
});