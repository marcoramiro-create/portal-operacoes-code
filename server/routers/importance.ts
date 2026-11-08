// ============================================================
// importanceRouter — PAINEL GLOBAL DE IMPORTÂNCIA (Compras)
// ============================================================
// Top itens / famílias / unidades pelo Índice de Importância
// (fórmula aprovada em 08/11/2026 — ver importanceIndex.ts para
// as regras de negócio completas: pesos 0,35/0,30/0,20/0,15 e
// cobertura contratual A=60/B=90/CDE=120).
// Somente-leitura; usa a última carga aprovada da Compras.
// ============================================================
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { getPortalIdentity } from "../supabasePortal";
import { inventoryAnalytics, protheusImports } from "../../drizzle/schema";
import { calcularImportancia, META_COBERTURA, FATOR_CURVA, PESOS } from "../importanceIndex";

function authorizationHeader(headers: Record<string, string | string[] | undefined>) {
  const value = headers.authorization;
  return Array.isArray(value) ? value[0] : value;
}

async function requireAdmin(headers: Record<string, string | string[] | undefined>) {
  const identity = await getPortalIdentity(authorizationHeader(headers));
  if (!identity?.isDevelopmentAdmin && !(identity?.profiles ?? []).includes("operations-admin")) {
    throw new Error("Apenas administradores podem consultar o painel de importância.");
  }
  return identity;
}

async function latestApprovedImportId(): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const row = (await db.select({ id: protheusImports.id }).from(protheusImports).where(eq(protheusImports.status, "approved")).orderBy(sql`${protheusImports.importedAt} desc`).limit(1))[0];
  return row?.id ?? null;
}

// Filiais da análise (mesma lista de server/db.ts — 12 filiais, exceto 0105 e 0201).
const ANALYSIS_BRANCHES = ["0101", "0102", "0103", "0106", "0107", "0108", "0301", "0303", "0304", "0305", "0306", "0307"];

export const importanceRouter = router({
  // Metadados da fórmula (para o painel mostrar os pesos visíveis).
  formula: publicProcedure.query(() => ({
    pesos: PESOS,
    metaCobertura: META_COBERTURA,
    fatorCurva: FATOR_CURVA,
    descricao: "Importância = (Valor estoque × 0,35) + (Consumo 13M × 0,30) + (Fator curva × 0,20) + (Fator cobertura × 0,15). Cobertura contratual: A=60 · B=90 · C/D/E=120 dias. Fator cobertura = desvio vs. meta da curva (abaixo=urgência, acima=excesso com peso menor, ±10% = saudável).",
  })),

  // Top N por dimensão (item | familia | unidade).
  top: publicProcedure
    .input(z.object({
      dimensao: z.enum(["item", "familia", "unidade"]),
      limite: z.number().int().min(5).max(50).default(20),
      branch: z.string().trim().max(24).optional(),
      curve: z.enum(["A", "B", "C", "D", "E"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.req.headers);
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível.");
      const importId = await latestApprovedImportId();
      if (!importId) return { rows: [], importId: null };

      const conditions = [eq(inventoryAnalytics.importId, importId), inArray(inventoryAnalytics.branch, ANALYSIS_BRANCHES)];
      if (input.branch) conditions.push(eq(inventoryAnalytics.branch, input.branch));
      if (input.curve) conditions.push(eq(inventoryAnalytics.curve, input.curve));
      const where = and(...conditions);

      if (input.dimensao === "item") {
        const rows = await db.select({
          code: inventoryAnalytics.code,
          codeOriginal: inventoryAnalytics.codeOriginal,
          description: inventoryAnalytics.description,
          branch: inventoryAnalytics.branch,
          family: inventoryAnalytics.family,
          curve: inventoryAnalytics.curve,
          stockValue: inventoryAnalytics.stockValue,
          salesValue13M: inventoryAnalytics.salesValue13M,
          coverageDays: inventoryAnalytics.coverageDays,
          excessValue: inventoryAnalytics.excessValue,
        }).from(inventoryAnalytics).where(where).limit(5000);
        const calculado = calcularImportancia(rows.map(row => ({
          ...row,
          stockValue: Number(row.stockValue),
          salesValue13M: Number(row.salesValue13M),
          coverageDays: Number(row.coverageDays),
          excessValue: Number(row.excessValue),
        })));
        calculado.sort((a, b) => b.importancia - a.importancia);
        return { importId, rows: calculado.slice(0, input.limite) };
      }

      // Familia ou Unidade: agrega primeiro, depois calcula o índice.
      const groupColumn = input.dimensao === "familia" ? inventoryAnalytics.family : inventoryAnalytics.branch;
      const rows = await db.select({
        grupo: groupColumn,
        stockValue: sql<string>`coalesce(sum(${inventoryAnalytics.stockValue}), 0)`,
        salesValue13M: sql<string>`coalesce(sum(${inventoryAnalytics.salesValue13M}), 0)`,
        excessValue: sql<string>`coalesce(sum(${inventoryAnalytics.excessValue}), 0)`,
        // Cobertura agregada = Σ estoque ÷ Σ CD (regra do projeto, nunca média).
        coverageDays: sql<string>`coalesce(sum(${inventoryAnalytics.stockValue}) / nullif(sum(case when ${inventoryAnalytics.salesValue13M} > 0 then ${inventoryAnalytics.stockValue} * 360 / ${inventoryAnalytics.salesValue13M} else 0 end), 0), 0)`,
        itens: sql<string>`count(*)`,
        // Curva dominante do grupo: a que concentra mais valor de estoque.
        curve: sql<string>`(array_agg(${inventoryAnalytics.curve} order by ${inventoryAnalytics.stockValue} desc))[1]`,
      }).from(inventoryAnalytics).where(where).groupBy(groupColumn);
      const calculado = calcularImportancia(rows.map(row => ({
        ...row,
        grupo: String(row.grupo ?? "—"),
        stockValue: Number(row.stockValue),
        salesValue13M: Number(row.salesValue13M),
        coverageDays: Number(row.coverageDays),
        excessValue: Number(row.excessValue),
        curve: String(row.curve ?? "E"),
        itens: Number(row.itens),
      })));
      calculado.sort((a, b) => b.importancia - a.importancia);
      return { importId, rows: calculado.slice(0, input.limite) };
    }),
});
