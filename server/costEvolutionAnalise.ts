// ============================================================
// costEvolutionAnalise.ts
// Ponte entre o portal e as funções SQL de evolução de custos.
// Chama as funções criadas no Supabase e devolve os dados
// prontos para a página do dashboard.
// ============================================================
import { getSupabasePool } from "./supabasePortal";

type CostEvolutionSegment = "auto_parts" | "industry";

// A base cost_records guarda autopeças e indústria juntas, e a função
// get_cost_evolution não recebe o segmento. A indústria tem filial única
// 0105: quando o segmento for "industry" e nenhuma filial vier informada,
// forçamos o filtro de filial para 0105 — isolando a base da indústria.
const INDUSTRY_BRANCH = "0105";

// Retorna a evolução mês a mês de cada item (matriz item x mês)
export async function getCostEvolutionAnalise(params: {
  segment?: CostEvolutionSegment;
  periodoInicio?: string;
  periodoFim?: string;
  filial?: string;
  codAgregado?: string;
  descricao?: string;
}) {
  const pool = getSupabasePool();
  const filial =
    params.segment === "industry" && !params.filial?.trim()
      ? INDUSTRY_BRANCH
      : (params.filial ?? null);
  const { rows } = await pool.query(
    `select get_cost_evolution($1, $2, $3, $4, $5) as result`,
    [
      params.periodoInicio ?? null,
      params.periodoFim ?? null,
      filial,
      params.codAgregado ?? null,
      params.descricao ?? null,
    ],
  );
  return rows[0]?.result ?? { periodos: [], items: [] };
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