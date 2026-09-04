// ============================================================
// costEvolutionAnalise.ts
// Ponte entre o portal e as funções SQL de evolução de custos.
// Chama as funções criadas no Supabase e devolve os dados
// prontos para a página do dashboard.
// ============================================================
import { getSupabasePool } from "./supabasePortal";

// A função SQL get_cost_evolution não recebe o segmento e pode devolver
// itens de autopeças e indústria juntos. A indústria tem filial única 0105:
// quando o segmento for "industry", filtramos os itens por essa filial.
const INDUSTRY_BRANCH = "0105";

export async function getCostEvolutionAnalise(params: {
  segment?: "auto_parts" | "industry";
  periodoInicio?: string;
  periodoFim?: string;
  filial?: string;
  codAgregado?: string;
  descricao?: string;
}) {
  const pool = getSupabasePool();
  const { rows } = await pool.query(
    `select get_cost_evolution($1, $2, $3, $4, $5) as result`,
    [
      params.periodoInicio ?? null,
      params.periodoFim ?? null,
      params.filial ?? null,
      params.codAgregado ?? null,
      params.descricao ?? null,
    ],
  );
  const result = rows[0]?.result ?? { periodos: [], items: [] };
  if (params.segment === "industry" && Array.isArray(result.items)) {
    result.items = result.items.filter(
      (item: { filial?: string | null }) => String(item?.filial ?? "").trim() === INDUSTRY_BRANCH,
    );
  }
  return result;
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