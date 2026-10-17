// ============================================================
// costEvolutionAnalise.ts
// Ponte entre o portal e as funções SQL de evolução de custos.
// ============================================================
import { getBusinessPool, getSupabasePool } from "./supabasePortal";
import { attachCostBenchmarkReport } from "./costEvolutionBenchmarkAdapter";
import { buildCostCurveLookup } from "./costCurveLookup";

type CostEvolutionSegment = "auto_parts" | "industry";
const INDUSTRY_BRANCH = "0105";

const MONTH_NAMES: Record<string, string> = {
  jan: "01", janeiro: "01", feb: "02", fevereiro: "02", mar: "03", marco: "03", março: "03",
  apr: "04", abril: "04", may: "05", maio: "05", jun: "06", junho: "06", jul: "07", julho: "07",
  aug: "08", ago: "08", agosto: "08", sep: "09", setembro: "09", oct: "10", out: "10", outubro: "10",
  nov: "11", novembro: "11", dec: "12", dez: "12", dezembro: "12",
};

function normalizeSalesPeriod(value: string): string | null {
  const text = value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const numeric = text.match(/^(\d{1,2})[\/-](\d{4})$/) ?? text.match(/^(\d{4})[\/-](\d{1,2})$/);
  if (numeric) {
    const year = numeric[1].length === 4 ? numeric[1] : numeric[2];
    const month = numeric[1].length === 4 ? numeric[2] : numeric[1];
    return `${year}${month.padStart(2, "0")}`;
  }
  const named = text.match(/^([a-z]+)[\s\/-]?(\d{4})$/) ?? text.match(/^(\d{4})[\s\/-]?([a-z]+)$/);
  if (!named) return null;
  const year = named[1].length === 4 ? named[1] : named[2];
  const monthName = named[1].length === 4 ? named[2] : named[1];
  const month = MONTH_NAMES[monthName];
  return month ? `${year}${month}` : null;
}

function codeVariants(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const normalized = raw.replace(/^0+(?=\d)/, "");
  return Array.from(new Set([raw, normalized]));
}

async function attachAutoPartsMonthlySales(
  businessPool: ReturnType<typeof getBusinessPool>,
  result: { items?: Array<{ filial?: string; cod_agregado?: string | null; codigo: string; meses: Array<Record<string, unknown>> }> },
) {
  const rows = await businessPool.query<{ branch: string; code: string; codeOriginal: string | null; salesMonths: Record<string, unknown> | null }>(
    `select trim(a.branch) as branch,
            trim(a.code) as code,
            nullif(trim(a."codeOriginal"), '') as "codeOriginal",
            a."salesMonths" as "salesMonths"
       from public."inventoryAnalytics" a
       join public."protheusImports" i on i.id = a."importId"
      where i.id = (
        select latest.id from public."protheusImports" latest
         where latest.status = 'approved'
         order by latest."importedAt" desc, latest.id desc limit 1
      )`,
  );
  const sales = new Map<string, Record<string, number>>();
  for (const row of rows.rows) {
    const values: Record<string, number> = {};
    for (const [period, amount] of Object.entries(row.salesMonths ?? {})) {
      const normalizedPeriod = normalizeSalesPeriod(period);
      const numericAmount = Number(amount);
      if (normalizedPeriod && Number.isFinite(numericAmount)) values[normalizedPeriod] = numericAmount;
    }
    for (const code of [...codeVariants(row.code), ...codeVariants(row.codeOriginal)]) {
      sales.set(`${row.branch}|${code}`, values);
    }
  }
  for (const item of result.items ?? []) {
    const branch = item.filial ?? "";
    const codes = [...codeVariants(item.cod_agregado), ...codeVariants(item.codigo)];
    const monthly = codes.map(code => sales.get(`${branch}|${code}`)).find(Boolean);
    if (!monthly) continue;
    for (const month of item.meses) {
      const period = normalizeSalesPeriod(String(month.period ?? ""));
      if (period && month.quantidade_vendida == null) month.quantidade_vendida = monthly[period] ?? null;
    }
  }
}

async function getCurrentCurveLookup(
  businessPool: ReturnType<typeof getBusinessPool>,
  portalPool: ReturnType<typeof getSupabasePool>,
  segment: CostEvolutionSegment | undefined,
  branch: string | null,
) {
  const rows: Array<{ code: string; codeOriginal?: string | null; branchCode: string; curve: string }> = [];

  // A Curva ABC/Indústria é um cadastro operacional. Na Produção ela está
  // em portal_operacoes_prod, enquanto cost_records fica em portal_negocio_prod.
  // Em instalações legadas os dois pools podem apontar para o mesmo banco.
  try {
    const operation = segment === "industry" ? "INDUSTRIA" : "AUTOPECAS";
    const result = await portalPool.query<{ code: string; codeOriginal: string | null; branchCode: string; curve: string }>(
      `select coalesce(
                nullif(trim(c.metadata->>'aggregateCode'), ''),
                nullif(trim(p.source_product_code), ''),
                trim(p.product_code)
              ) as code,
              nullif(trim(p.source_product_code), '') as "codeOriginal",
              trim(c.branch_code) as "branchCode",
              c.curve_code as curve
         from public.sbz_product_curves c
         left join public.products p on p.id = c.product_id
        where c.operation = $1
          and c.is_current = true
          and ($2::text is null or c.branch_code = $2)
          and c.curve_code in ('A', 'B', 'C', 'D', 'E')`,
      [operation, branch],
    );
    for (const row of result.rows) {
      rows.push(row);
      if (row.codeOriginal && row.codeOriginal !== row.code) {
        rows.push({ code: row.codeOriginal, branchCode: row.branchCode, curve: row.curve });
      }
    }
  } catch {
    // Bases antigas podem não possuir a tabela de curvas.
  }

  // Autopeças usa a Curva ABCDE calculada na última importação aprovada de
  // Compras. A fonte fica no banco de negócio, não em sbz_product_curves.
  if (segment !== "industry") {
    try {
      const result = await businessPool.query<{ code: string; codeOriginal: string | null; branchCode: string; curve: string }>(
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

export async function getCostEvolutionAnalise(params: {
  segment?: CostEvolutionSegment;
  periodoInicio?: string;
  periodoFim?: string;
  filial?: string;
  codAgregado?: string;
  descricao?: string;
}) {
  const businessPool = getBusinessPool();
  const portalPool = getSupabasePool();
  const filial =
    params.segment === "industry" && !params.filial?.trim()
      ? INDUSTRY_BRANCH
      : (params.filial ?? null);
  const { rows } = await businessPool.query(
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
  if (params.segment !== "industry") await attachAutoPartsMonthlySales(businessPool, result);
  const curves = await getCurrentCurveLookup(businessPool, portalPool, params.segment, filial);
  // Mesmo sem curvas encontradas, anexa o relatório para que a interface
  // mostre a coluna/diagnóstico "Sem curva" em vez de ocultar o painel.
  return attachCostBenchmarkReport(result, curves, params.segment ?? "auto_parts");
}

export async function getFiliais() {
  const pool = getBusinessPool();
  const { rows } = await pool.query(`select get_filiais() as result`);
  return rows[0]?.result ?? [];
}

export async function getCodAgregados() {
  const pool = getBusinessPool();
  const { rows } = await pool.query(`select get_cod_agregados() as result`);
  return rows[0]?.result ?? [];
}

export async function getPeriodos() {
  const pool = getBusinessPool();
  const { rows } = await pool.query(`select get_periodos() as result`);
  return rows[0]?.result ?? [];
}
