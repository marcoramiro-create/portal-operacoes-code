// ============================================================
// costEvolutionAnalise.ts
// Ponte entre o portal e as funções SQL de evolução de custos.
// Chama as funções criadas no Supabase e devolve os dados
// prontos para a página do dashboard.
// ============================================================
import { getBusinessPool } from "./supabasePortal";
import { attachCostBenchmarkReport } from "./costEvolutionBenchmarkAdapter";
import { buildCostCurveLookup } from "./costCurveLookup";

type CostEvolutionSegment = "auto_parts" | "industry";

// A base cost_records guarda autopeças e indústria juntas, e a função
// get_cost_evolution não recebe o segmento. A indústria tem filial única
// 0105: quando o segmento for "industry" e nenhuma filial vier informada,
// forçamos o filtro de filial para 0105 — isolando a base da indústria.
const INDUSTRY_BRANCH = "0105";

async function getCurrentCurveLookup(
  pool: ReturnType<typeof getBusinessPool>,
  segment: CostEvolutionSegment | undefined,
  branch: string | null,
) {
  const rows: Array<{ code: string; branchCode: string; curve: string }> = [];
  try {
    const operation = segment === "industry" ? "INDUSTRIA" : "AUTOPECAS";
    const result = await pool.query<{ code: string; branchCode: string; curve: string }>(
      `select coalesce(nullif(trim(p.source_product_code), ''), trim(p.product_code)) as code,
              trim(c.branch_code) as "branchCode",
              c.curve_code as curve
         from public.sbz_product_curves c
         join public.products p on p.id = c.product_id
        where c.operation = $1
          and c.is_current = true
          and ($2::text is null or c.branch_code = $2)
          and c.curve_code in ('A', 'B', 'C', 'D', 'E')`,
      [operation, branch],
    );
    rows.push(...result.rows);
  } catch {
    // Instalações antigas podem ainda não possuir a tabela de curvas.
  }

  // Autopeças tem sua curva ABCDE calculada na importação aprovada de Compras
  // (inventoryAnalytics). A tabela sbz_product_curves é a fonte persistida da
  // Curva ABC da Indústria e não deve ser usada como única fonte para Compras.
  if (segment !== "industry") {
    try {
      const result = await pool.query<{ code: string; codeOriginal: string | null; branchCode: string; curve: string }>(
        `select trim(a.code) as code,
                nullif(trim(a."codeOriginal"), '') as "codeOriginal",
                trim(a.branch) as "branchCode",
                trim(a.curve) as curve
           from public."inventoryAnalytics" a
           join public."protheusImports" i on i.id = a."importId"
          where i.id = (
            select latest.id
              from public."protheusImports" latest
             where latest.status = 'approved'
             order by latest."importedAt" desc, latest.id desc
             limit 1
          )
            and ($1::text is null or trim(a.branch) = $1)
            and trim(a.curve) in ('A', 'B', 'C', 'D', 'E')`,
        [branch],
      );
      for (const row of result.rows) {
        rows.push(row);
        if (row.codeOriginal && row.codeOriginal !== row.code) {
          rows.push({ code: row.codeOriginal, branchCode: row.branchCode, curve: row.curve });
        }
      }
    } catch {
      // Uma base sem o histórico de Compras continua exibindo SEM_CURVA.
    }
  }

  return buildCostCurveLookup(rows);
}

// Retorna a evolução mês a mês de cada item (matriz item x mês)
export async function getCostEvolutionAnalise(params: {
  segment?: CostEvolutionSegment;
  periodoInicio?: string;
  periodoFim?: string;
  filial?: string;
  codAgregado?: string;
  descricao?: string;
}) {
  const pool = getBusinessPool();
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
  const result = rows[0]?.result ?? { periodos: [], items: [] };
  const curves = await getCurrentCurveLookup(pool, params.segment, filial);
  if (Object.keys(curves).length === 0) return result;
  return attachCostBenchmarkReport(result, curves, params.segment ?? "auto_parts");
}

// Retorna a lista de filiais (para o dropdown)
export async function getFiliais() {
  const pool = getBusinessPool();
  const { rows } = await pool.query(`select get_filiais() as result`);
  return rows[0]?.result ?? [];
}

// Retorna a lista de itens agregados (para o dropdown)
export async function getCodAgregados() {
  const pool = getBusinessPool();
  const { rows } = await pool.query(`select get_cod_agregados() as result`);
  return rows[0]?.result ?? [];
}

// Retorna a lista de períodos existentes (para os dropdowns de data)
export async function getPeriodos() {
  const pool = getBusinessPool();
  const { rows } = await pool.query(`select get_periodos() as result`);
  return rows[0]?.result ?? [];
}
