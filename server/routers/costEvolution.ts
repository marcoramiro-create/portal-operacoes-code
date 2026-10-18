import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { previewCostEvolutionWorkbook } from "../costEvolution";
import { commitCostEvolutionImport, getCostEvolutionFilterOptions, getCostEvolutionItems, getCostEvolutionSummary, listCostEvolutionImports, updateCostEvolutionImportStatus } from "../costEvolutionService";
import { assertApplicationPermission, getPortalIdentity, getSupabasePool, listObservacoes, recordPortalAudit, upsertObservacao } from "../supabasePortal";
import { getCodAgregados, getCodAgregadosComDescricao, getCostEvolutionAnalise, getCostEvolutionItens, getFiliais, getPeriodos } from "../costEvolutionAnalise";
import { garantirIndicesEconomicos } from "../economicIndices";

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
// Limites de alerta configuráveis pelo usuário no filtro.
const limitesAlerta = z.object({
  A: z.number().min(0).max(100).optional(),
  B: z.number().min(0).max(100).optional(),
  C: z.number().min(0).max(100).optional(),
  D: z.number().min(0).max(100).optional(),
  E: z.number().min(0).max(100).optional(),
}).optional();
const baseAnalise = {
  segment,
  periodoInicio: z.string().trim().max(7).optional(),
  periodoFim: z.string().trim().max(7).optional(),
  filial: z.string().trim().max(24).optional(),
  codAgregado: z.string().trim().max(120).optional(),
  descricao: z.string().trim().max(255).optional(),
};
const analiseFilters = z.object({ ...baseAnalise, searchType: z.enum(["contem", "inicia", "termina"]).optional(), limitesAlerta });
const itensFilters = z.object({
  ...baseAnalise,
  searchType: z.enum(["contem", "inicia", "termina"]).optional(),
  limitesAlerta,
  // B-v3 (18/10/2026): eixo Curva independente do Critério — itens de outra
  // curva jamais aparecem no grid paginado.
  curvaFiltro: z.enum(["A", "B", "C", "D", "E"]).optional(),
  pagina: z.number().int().min(1).optional(),
  itensPorPagina: z.number().int().min(10).max(200).optional(),
  ordenacao: z.enum(["impacto", "variacao", "codigo", "descricao"]).optional(),
  criterio: z.enum(["todos", "acima-limite", "alta", "reducao", "sem-base", "sem-curva", "curva-A", "curva-B", "curva-C", "curva-D", "curva-E"]).optional(),
});
// Janela dos últimos 24 meses para o botão "Atualizar índices" (completa apenas
// os meses faltantes no cache; índices de mês fechado não mudam).
function ultimosPeriodos(qtde: number): string[] {
  const base = new Date();
  const lista: string[] = [];
  for (let i = 0; i < qtde; i++) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    lista.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return lista.reverse();
}
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
    try {
      await recordPortalAudit(identity, "cost_evolution_import", identity.id, "created", { costImportId: result.id, segment: input.segment, fileName: input.fileName, itemCount: result.itemCount, observationCount: result.observationCount });
    } catch {
      // auditoria opcional — não bloqueia a importação.
    }
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
    try {
      await recordPortalAudit(identity, "cost_evolution_import", identity.id, input.status, { costImportId: input.id, segment: input.segment });
    } catch {
      // auditoria opcional — não bloqueia a operação.
    }
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
      // A Indústria usa SEMPRE a filial 0105 — forçado aqui no servidor.
      filial: input.segment === "industry" ? "0105" : (input.filial ?? undefined),
      codAgregado: input.codAgregado,
      descricao: input.descricao,
      searchType: input.searchType,
      limitesAlerta: input.limitesAlerta,
    });
  }),
  // Grid sob demanda — itens paginados (50/página). Resposta em KBs em vez dos
  // ~5 MB de antes: esta separação elimina o timeout de forma definitiva.
  itensEvolutivos: publicProcedure.input(itensFilters).query(async ({ ctx, input }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    await assertApplicationPermission(identity, dashboardNode(input.segment), "view");
    return getCostEvolutionItens({
      segment: input.segment,
      periodoInicio: input.periodoInicio,
      periodoFim: input.periodoFim,
      filial: input.segment === "industry" ? "0105" : (input.filial ?? undefined),
      codAgregado: input.codAgregado,
      descricao: input.descricao,
      searchType: input.searchType,
      limitesAlerta: input.limitesAlerta,
      curvaFiltro: input.curvaFiltro,
      pagina: input.pagina,
      itensPorPagina: input.itensPorPagina,
      ordenacao: input.ordenacao,
      criterio: input.criterio,
    });
  }),
  // Botão "Atualizar índices" — completa os meses faltantes nas APIs oficiais
  // (IBGE/SIDRA e BCB/PTAX). Escrita apenas no cache; a análise nunca quebra.
  atualizarIndices: publicProcedure.mutation(async ({ ctx }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    await assertApplicationPermission(identity, dashboardNode("auto_parts"), "view");
    const status = await garantirIndicesEconomicos(getSupabasePool(), ultimosPeriodos(24));
    const falhas = Object.entries(status).filter(([, valor]) => valor === "indisponivel").map(([indice]) => indice);
    return {
      ...status,
      mensagem: falhas.length
        ? `Completados os meses disponíveis. ${falhas.join(" e ")}: fonte oficial indisponível agora — a análise segue com o último valor gravado.`
        : "Índices oficiais atualizados: meses faltantes completados nas fontes IBGE (IPCA) e Banco Central (PTAX).",
    };
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
  // Agregados COM descrição curta — alimenta o combo pesquisável da tela.
  codAgregadosDetalhados: publicProcedure.input(z.object({ segment })).query(async ({ ctx, input }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    await assertApplicationPermission(identity, dashboardNode(input.segment), "view");
    return getCodAgregadosComDescricao();
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