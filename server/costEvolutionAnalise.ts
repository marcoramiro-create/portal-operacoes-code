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
  if (/^\d{6}$/.test(text) && Number(text.slice(4, 6)) >= 1 && Number(text.slice(4, 6)) <= 12) return text;
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

function previousPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));
  return month === 1 ? `${year - 1}12` : `${year}${String(month - 1).padStart(2, "0")}`;
}

function monthRange(start: string, end: string): string[] {
  const result: string[] = [];
  let current = start;
  while (current <= end) {
    result.push(current);
    const year = Number(current.slice(0, 4));
    const month = Number(current.slice(4, 6));
    current = month === 12 ? `${year + 1}01` : `${year}${String(month + 1).padStart(2, "0")}`;
  }
  return result;
}

async function attachIndustryMonthlyConsumption(
  portalPool: ReturnType<typeof getSupabasePool>,
  result: { periodos?: Array<{ period: string }>; items?: Array<{ filial?: string; cod_agregado?: string | null; codigo: string; meses: Array<Record<string, unknown>> }> },
) {
  const periods = (result.periodos ?? []).map(item => normalizeSalesPeriod(item.period)).filter((item): item is string => item != null).sort();
  if (!periods.length) return;
  const batches = await portalPool.query<{ id: string; source_kind: string }>(
    `select distinct on (source_kind) id, source_kind
       from public.operational_import_batches
      where status = 'processed' and source_kind in ('ENTRADA_NF', 'FECHAMENTO_ESTOQUE')
      order by source_kind, imported_at desc, id desc`,
  );
  const batchIds = batches.rows.map(row => row.id);
  if (!batchIds.length) return;
  const sourceRows = await portalPool.query<{
    sourceKind: string;
    productCode: string | null;
    aggregateCode: string | null;
    branch: string | null;
    normalizedPayload: Record<string, unknown>;
  }>(
    `select b.source_kind as "sourceKind",
            r.product_code as "productCode",
            r.aggregate_product_code as "aggregateCode",
            r.branch_code as branch,
            r.normalized_payload as "normalizedPayload"
       from public.operational_source_rows r
       join public.operational_import_batches b on b.id = r.batch_id
      where r.batch_id = any($1::uuid[])`,
    [batchIds],
  );
  const stock = new Map<string, number>();
  const entries = new Map<string, number>();
  const aggregateByProduct = new Map<string, string>();
  const start = previousPeriod(periods[0]);
  const allPeriods = monthRange(start, periods[periods.length - 1]);
  const add = (target: Map<string, number>, key: string, value: number) => target.set(key, (target.get(key) ?? 0) + value);
  for (const row of sourceRows.rows) {
    const payload = row.normalizedPayload ?? {};
    const product = String(row.productCode ?? payload.productCode ?? "").trim();
    const aggregate = String(row.aggregateCode ?? payload.aggregateProductCode ?? product).trim();
    const branch = String(row.branch ?? payload.branch ?? INDUSTRY_BRANCH).trim();
    const productKey = `${branch}|${product}`;
    if (product && aggregate) {
      for (const productVariant of codeVariants(product)) {
        for (const aggregateVariant of codeVariants(aggregate)) {
          aggregateByProduct.set(`${branch}|${productVariant}`, aggregateVariant);
        }
      }
    }
    if (row.sourceKind === "FECHAMENTO_ESTOQUE") {
      const year = Number(payload.year);
      const month = Number(payload.month);
      const period = year && month ? `${year}${String(month).padStart(2, "0")}` : null;
      const value = Number(payload.totalValue);
      if (period && Number.isFinite(value)) add(stock, `${productKey}|${period}`, value);
    } else {
      const period = normalizeSalesPeriod(String(payload.entryDate ?? ""));
      const quantity = Number(payload.quantity);
      const unitValue = Number(payload.itemValue);
      if (period && Number.isFinite(quantity) && Number.isFinite(unitValue)) add(entries, `${productKey}|${period}`, quantity * unitValue);
    }
  }
  const consumption = new Map<string, number>();
  for (const [productKey, aggregate] of aggregateByProduct) {
    let previousStock = stock.get(`${productKey}|${allPeriods[0]}`) ?? 0;
    for (const period of allPeriods) {
      const currentStock = stock.get(`${productKey}|${period}`) ?? 0;
      const value = Math.max(0, previousStock + (entries.get(`${productKey}|${period}`) ?? 0) - currentStock);
      if (period >= periods[0]) add(consumption, `${productKey.split("|")[0]}|${aggregate}|${period}`, value);
      previousStock = currentStock;
    }
  }
  for (const item of result.items ?? []) {
    const branch = item.filial ?? INDUSTRY_BRANCH;
    const aggregateVariants = [...codeVariants(item.cod_agregado), ...codeVariants(item.codigo)];
    for (const month of item.meses) {
      const period = normalizeSalesPeriod(String(month.period ?? ""));
      if (!period || month.valor_consumo != null) continue;
      const value = aggregateVariants.map(aggregate => consumption.get(`${branch}|${aggregate}|${period}`)).find(item => item != null);
      month.valor_consumo = value ?? null;
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
  if (params.segment === "industry") await attachIndustryMonthlyConsumption(portalPool, result);
  else await attachAutoPartsMonthlySales(businessPool, result);
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
