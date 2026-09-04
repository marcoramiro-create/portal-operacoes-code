// ============================================================
// costEvolutionAnalise.ts
// Ponte entre o portal e os dados de evolução de custos.
// Busca a versão aprovada DO SEGMENTO (autopeças ou indústria)
// e devolve os dados prontos para a página do dashboard.
// ============================================================
import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { costEvolutionImports, costEvolutionItems, costEvolutionObservations } from "../drizzle/schema";
import { getDb } from "./db";
import { getSupabasePool } from "./supabasePortal";

type CostEvolutionSegment = "auto_parts" | "industry";

async function latestApprovedImport(segment: CostEvolutionSegment) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(costEvolutionImports)
    .where(and(eq(costEvolutionImports.segment, segment), eq(costEvolutionImports.status, "approved")))
    .orderBy(desc(costEvolutionImports.importedAt), desc(costEvolutionImports.id)).limit(1))[0];
}

// Converte a data em chave de período no formato aaaaMM (ex.: 2025-01-31 -> "202501")
function periodKey(date: Date | string) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Retorna a evolução mês a mês de cada item do segmento (matriz item x mês)
export async function getCostEvolutionAnalise(params: {
  segment: CostEvolutionSegment;
  periodoInicio?: string;
  periodoFim?: string;
  filial?: string;
  codAgregado?: string;
  descricao?: string;
}) {
  const db = await getDb();
  if (!db) return { periodos: [], items: [] };

  // Somente a versão APROVADA mais recente DO SEGMENTO alimenta a análise.
  const current = await latestApprovedImport(params.segment);
  if (!current) return { periodos: [], items: [] };

  const conditions = [eq(costEvolutionItems.importId, current.id)];
  if (params.filial?.trim()) conditions.push(eq(costEvolutionItems.branch, params.filial.trim()));
  if (params.codAgregado?.trim()) conditions.push(eq(costEvolutionItems.aggregateCode, params.codAgregado.trim()));
  if (params.descricao?.trim()) {
    const term = `%${params.descricao.trim()}%`;
    const search = or(
      like(costEvolutionItems.code, term),
      like(costEvolutionItems.aggregateCode, term),
      like(costEvolutionItems.description, term),
    );
    if (search) conditions.push(search);
  }

  const items = await db.select().from(costEvolutionItems)
    .where(and(...conditions))
    .orderBy(asc(costEvolutionItems.code), asc(costEvolutionItems.branch));

  const ids = items.map(item => item.id);
  if (!ids.length) return { periodos: [], items: [] };

  const observations = await db.select().from(costEvolutionObservations)
    .where(sql`${costEvolutionObservations.itemId} in (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`)
    .orderBy(asc(costEvolutionObservations.balanceDate));

  const inicio = params.periodoInicio?.trim();
  const fim = params.periodoFim?.trim();
  const obsByItem = new Map<number, typeof observations>();
  const periodSet = new Set<string>();

  observations.forEach(observation => {
    const key = periodKey(observation.balanceDate);
    if (inicio && key < inicio) return;
    if (fim && key > fim) return;
    periodSet.add(key);
    obsByItem.set(observation.itemId, [...(obsByItem.get(observation.itemId) ?? []), observation]);
  });

  const periodos = [...periodSet].sort().map(period => ({ period }));

  return {
    periodos,
    items: items.map(item => {
      const serie = obsByItem.get(item.id) ?? [];
      const byPeriod = new Map<string, number>();
      serie.forEach(observation => {
        byPeriod.set(periodKey(observation.balanceDate), Number(observation.cost));
      });
      return {
        codigo: item.code,
        descricao: item.description,
        filial: item.branch,
        cod_agregado: item.aggregateCode,
        meses: [...byPeriod.entries()].map(([period, custo_medio]) => ({ period, custo_medio })),
      };
    }),
  };
}

// Retorna a lista de filiais (para o dropdown)
export async function getFiliais() {
  const pool = getSupabasePool();
  const { rows } = await pool.query(`select get_filiais() as result`);
  return rows[0]?.result ?? [];
}

// Retorna a lista de itens agregados (para o dropdown)
export async function getCodAgregados() {
  const pool = getSupabasePool();
  const { rows } = await pool.query(`select get_cod_agregados() as result`);
  return rows[0]?.result ?? [];
}

// Retorna a lista de períodos existentes (para os dropdowns de data)
export async function getPeriodos() {
  const pool = getSupabasePool();
  const { rows } = await pool.query(`select get_periodos() as result`);
  return rows[0]?.result ?? [];
}