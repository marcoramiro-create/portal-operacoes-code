// ============================================================
// costEvolutionAnalise.ts
// B-v12 (20/10/2026): (1) RÉGUA DE FERRO DO CUSTO — o item só entra na
// análise se tiver CUSTO MÉDIO no período (quem tem consumo mas não tem
// preço fica FORA e é contabilizado no diagnóstico; anomalia a tratar na
// origem); (2) ordenação do grid estendida (filial, código, descrição,
// curva, variação, impacto) com DIREÇÃO asc/desc. Mantém TODO o motor
// B-v8/v9/v10/v11 intacto.
// B-v11 (19/10/2026): novos limites padrão da régua — A 3,00 · B 3,50 ·
// C/D/E 4,00; itens sem base fora da análise; consumo quantitativo
// (Autopeças). B-v10: correção da regressão que zerou os valores — AS
// branch nos SELECTs, LAG POR PRODUTO com quebra de cadeia em buracos de
// calendário, filtro regex nos payloads numéricos. B-v9: motor único
// (triângulo Variação ponderada × Custo total = Impacto). B-v8: agregação
// no Postgres + cache TTL 10 min.
// ============================================================
import { getBusinessPool, getSupabasePool } from "./supabasePortal";
import { attachCostBenchmarkReport } from "./costEvolutionBenchmarkAdapter";
import { buildCostCurveLookup } from "./costCurveLookup";
import { garantirIndicesEconomicos, getIndicesEconomicos } from "./economicIndices";
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
  const numeric = text.match(/^(\d{1,2})[\/\-](\d{4})$/) ?? text.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (numeric) {
    const year = numeric[1].length === 4 ? numeric[1] : numeric[2];
    const month = numeric[1].length === 4 ? numeric[2] : numeric[1];
    return `${year}${month.padStart(2, "0")}`;
  }
  const named = text.match(/^([a-z]+)[\s\/\-]?(\d{4})$/) ?? text.match(/^(\d{4})[\s\/\-]?([a-z]+)$/);
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
function previousPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));
  return month === 1 ? `${year - 1}12` : `${year}${String(month - 1).padStart(2, "0")}`;
}
// ————— Limites de alerta configuráveis —————
export type LimitesAlerta = { A: number; B: number; C: number; D: number; E: number };
// B-v11: novos limites padrão da régua — A 3,00 · B 3,50 · C/D/E 4,00.
export const LIMITES_PADRAO: LimitesAlerta = { A: 3, B: 3.5, C: 4, D: 4, E: 4 };
function sanitizarLimites(entrada?: Partial<LimitesAlerta> | null): LimitesAlerta {
  const limites: LimitesAlerta = { ...LIMITES_PADRAO };
  for (const curva of ["A", "B", "C", "D", "E"] as const) {
    const bruto = entrada?.[curva];
    if (bruto == null || !Number.isFinite(Number(bruto))) continue;
    const valor = Math.round(Number(bruto) * 10) / 10;
    limites[curva] = Math.min(100, Math.max(0, valor));
  }
  return limites;
}
// ————— Séries, consumo e impacto —————
type MesInterno = { period: string; custo_medio: number | null; quantidade_vendida?: number | null; valor_consumo?: number | null };
type ItemInterno = {
  codigo: string; descricao?: string; filial?: string; cod_agregado?: string | null;
  curve?: string; costStatus?: string;
  estoque?: number | null; estoqueValor?: number | null; estoqueAgregado?: number | null;
  variacaoPercent?: number | null; impactoEstimado?: number | null; consumoMedioMensal?: number | null;
  consumoTotal?: number | null; consumoMedioQuantidade?: number | null; consumoTotalQuantidade?: number | null;
  meses: MesInterno[];
};
function serieCusto(item: ItemInterno, periods: string[]): (number | null)[] {
  const values = new Map(item.meses.map(mes => [mes.period, mes.custo_medio]));
  let anterior: number | null = null;
  return periods.map(period => {
    const atual = values.get(period);
    if (atual != null && atual !== 0) anterior = atual;
    return anterior;
  });
}
function extremosDoCusto(item: ItemInterno): { inicial: number | null; final: number | null } {
  let inicial: number | null = null;
  let final: number | null = null;
  for (const mes of item.meses) {
    const valor = mes.custo_medio;
    if (valor == null || valor === 0) continue;
    if (inicial == null) inicial = valor;
    final = valor;
  }
  return { inicial, final };
}
function variacaoDoItem(item: ItemInterno): number | null {
  const { inicial, final } = extremosDoCusto(item);
  if (inicial == null || final == null || inicial === 0) return null;
  return ((final - inicial) * 100) / inicial;
}
// Consumo em reais por mês: Indústria = valor_consumo (reais por agregado);
// Autopeças = quantidade vendida (por agregado) × custo médio do item.
function consumoMensalEmReais(mes: MesInterno, segment: CostEvolutionSegment): number | null {
  if (segment === "industry") {
    const valor = mes.valor_consumo ?? null;
    return valor != null && Number.isFinite(valor) ? valor : null;
  }
  const quantidade = mes.quantidade_vendida ?? null;
  const custo = mes.custo_medio;
  if (quantidade == null || !Number.isFinite(quantidade) || custo == null) return null;
  return quantidade * custo;
}
function consumoMedioDoItem(item: ItemInterno, segment: CostEvolutionSegment): number | null {
  const valores = item.meses.map(mes => consumoMensalEmReais(mes, segment)).filter((valor): valor is number => valor != null);
  if (!valores.length) return null;
  return valores.reduce((acc, valor) => acc + valor, 0) / valores.length;
}
function consumoTotalDoItem(item: ItemInterno, segment: CostEvolutionSegment): number | null {
  const valores = item.meses.map(mes => consumoMensalEmReais(mes, segment)).filter((valor): valor is number => valor != null);
  if (!valores.length) return null;
  return valores.reduce((acc, valor) => acc + valor, 0);
}
function enriquecerItens(items: ItemInterno[], segment: CostEvolutionSegment): void {
  for (const item of items) {
    const variacaoPercent = variacaoDoItem(item);
    const consumoMedioMensal = consumoMedioDoItem(item, segment);
    const consumoTotal = consumoTotalDoItem(item, segment);
    let impactoEstimado: number | null = null;
    // Impacto = variação % do período × consumo TOTAL do período.
    if (variacaoPercent != null && consumoTotal != null) {
      impactoEstimado = consumoTotal * (variacaoPercent / 100);
    }
    // Consumo QUANTITATIVO — Autopeças tem quantidade vendida por mês;
    // a Indústria fica "—" até o campo de quantidade do fechamento ser
    // confirmado na origem (o card exibe "—" honesto, nunca inventa base).
    const quantidades = item.meses
      .map(mes => mes.quantidade_vendida)
      .filter((valor): valor is number => valor != null && Number.isFinite(valor));
    const somaQuantidades = quantidades.reduce((acc, valor) => acc + valor, 0);
    item.variacaoPercent = variacaoPercent == null ? null : Number(variacaoPercent.toFixed(4));
    item.impactoEstimado = impactoEstimado == null ? null : Number(impactoEstimado.toFixed(2));
    item.consumoMedioMensal = consumoMedioMensal == null ? null : Number(consumoMedioMensal.toFixed(2));
    item.consumoTotal = consumoTotal == null ? null : Number(consumoTotal.toFixed(2));
    item.consumoMedioQuantidade = quantidades.length ? Number((somaQuantidades / quantidades.length).toFixed(2)) : null;
    item.consumoTotalQuantidade = quantidades.length ? Number(somaQuantidades.toFixed(2)) : null;
  }
}
// B-v12 (20/10/2026): RÉGUA DE FERRO — item sem CUSTO MÉDIO no período não
// entra, NUNCA MAIS. O B-v11 ainda admitia quem tinha consumo mas não tinha
// preço; o usuário determinou que isso é anomalia: fica fora e é CONTADO no
// diagnóstico para tratamento na origem.
function temCustoReal(item: ItemInterno): boolean {
  return item.meses.some(mes => mes.custo_medio != null && mes.custo_medio !== 0);
}
function temConsumoSemPreco(item: ItemInterno, segment: CostEvolutionSegment): boolean {
  if (temCustoReal(item)) return false;
  return item.meses.some(mes => consumoMensalEmReais(mes, segment) != null);
}
// ————— Pesos mensais e estoque — fontes já aprovadas —————
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
// Estoque do Autopeças — fotografia da última importação aprovada de Compras.
async function attachAutoPartsEstoque(
  businessPool: ReturnType<typeof getBusinessPool>,
  result: { items?: Array<{ filial?: string; cod_agregado?: string | null; codigo: string; estoque?: number | null; estoqueValor?: number | null }> },
) {
  const rows = await businessPool.query<{ branch: string; code: string; codeOriginal: string | null; stock: string; stockValue: string }>(
    `select trim(a.branch) as branch,
            trim(a.code) as code,
            nullif(trim(a."codeOriginal"), '') as "codeOriginal",
            a.stock as stock,
            a."stockValue" as "stockValue"
       from public."inventoryAnalytics" a
       join public."protheusImports" i on i.id = a."importId"
      where i.id = (
        select latest.id from public."protheusImports" latest
         where latest.status = 'approved'
         order by latest."importedAt" desc, latest.id desc limit 1
      )`,
  );
  const estoque = new Map<string, { stock: number; valor: number }>();
  for (const row of rows.rows) {
    const entrada = { stock: Number(row.stock), valor: Number(row.stockValue) };
    for (const code of [...codeVariants(row.code), ...codeVariants(row.codeOriginal)]) {
      estoque.set(`${row.branch}|${code}`, entrada);
    }
  }
  for (const item of result.items ?? []) {
    const branch = item.filial ?? "";
    const codes = [...codeVariants(item.cod_agregado), ...codeVariants(item.codigo)];
    const achado = codes.map(code => estoque.get(`${branch}|${code}`)).find(Boolean);
    if (achado) { item.estoque = achado.stock; item.estoqueValor = achado.valor; }
  }
}
// ————— B-v8/B-v10: consumo da Indústria — AGREGAÇÃO NO POSTGRES + CACHE —————
// CTE lê fotos de saldo (FECHAMENTO_ESTOQUE) e entradas (ENTRADA_NF) de TODOS
// os batches processados, calcula o consumo POR PRODUTO (LAG com quebra de
// cadeia em buracos de calendário — paridade com a fórmula validada da Curva
// ABC) e soma no AGREGADO no final. REGRA DO ALIAS (B-v10): o nome da coluna
// no SELECT TEM que casar com o campo do tipo declarado.
const REGEX_NUM = "^-?[0-9]+(\\.[0-9]+)?$";
type ConsumoIndustria = { consumo: Map<string, number>; estoqueAgregado: Map<string, number>; gravadoEm: number };
const CACHE_CONSUMO_TTL_MS = 10 * 60 * 1000;
const cacheConsumoIndustria = new Map<string, ConsumoIndustria>();
async function obterConsumoIndustria(
  portalPool: ReturnType<typeof getSupabasePool>,
  periods: string[],
): Promise<{ consumo: Map<string, number>; estoqueAgregado: Map<string, number> }> {
  const chave = `${periods[0]}:${periods[periods.length - 1]}`;
  const existente = cacheConsumoIndustria.get(chave);
  if (existente && Date.now() - existente.gravadoEm < CACHE_CONSUMO_TTL_MS) {
    return { consumo: existente.consumo, estoqueAgregado: existente.estoqueAgregado };
  }
  const inicio = previousPeriod(periods[0]);
  const fim = periods[periods.length - 1];
  const consumoRows = await portalPool.query<{ branch: string; agregado: string; period: string; consumo: string }>(
    `WITH fotos AS (
        SELECT r.branch_code,
               r.product_code AS produto,
               COALESCE(nullif(r.aggregate_product_code, ''), r.product_code) AS agregado,
               (r.normalized_payload->>'year') || lpad(r.normalized_payload->>'month', 2, '0') AS period,
               SUM((r.normalized_payload->>'totalValue')::numeric) AS saldo
          FROM public.operational_source_rows r
          JOIN public.operational_import_batches b ON b.id = r.batch_id
         WHERE b.status = 'processed' AND b.source_kind = 'FECHAMENTO_ESTOQUE'
           AND r.branch_code IS NOT NULL AND r.product_code IS NOT NULL
           AND r.normalized_payload->>'totalValue' ~ '${REGEX_NUM}'
         GROUP BY 1, 2, 3, 4
     ),
     entradas AS (
        SELECT r.branch_code,
               r.product_code AS produto,
               COALESCE(nullif(r.aggregate_product_code, ''), r.product_code) AS agregado,
               replace(substring(r.normalized_payload->>'entryDate' from 1 for 7), '-', '') AS period,
               SUM((r.normalized_payload->>'quantity')::numeric * (r.normalized_payload->>'itemValue')::numeric) AS valor
          FROM public.operational_source_rows r
          JOIN public.operational_import_batches b ON b.id = r.batch_id
         WHERE b.status = 'processed' AND b.source_kind = 'ENTRADA_NF'
           AND r.branch_code IS NOT NULL AND r.product_code IS NOT NULL
           AND r.normalized_payload->>'quantity' ~ '${REGEX_NUM}'
           AND r.normalized_payload->>'itemValue' ~ '${REGEX_NUM}'
         GROUP BY 1, 2, 3, 4
     ),
     serie AS (
        SELECT f.branch_code, f.produto, f.agregado, f.period, f.saldo,
               CASE WHEN f.period = to_char(to_date(LAG(f.period) OVER (PARTITION BY f.branch_code, f.produto ORDER BY f.period), 'YYYYMM') + INTERVAL '1 month', 'YYYYMM')
                    THEN LAG(f.saldo) OVER (PARTITION BY f.branch_code, f.produto ORDER BY f.period)
               END AS saldo_anterior
          FROM fotos f
     )
     SELECT s.branch_code AS branch, s.agregado, s.period,
            SUM(GREATEST(0, s.saldo_anterior + COALESCE(e.valor, 0) - s.saldo)) AS consumo
       FROM serie s
       LEFT JOIN entradas e
         ON e.branch_code = s.branch_code AND e.produto = s.produto AND e.period = s.period
      WHERE s.saldo_anterior IS NOT NULL
        AND s.period BETWEEN $1 AND $2
      GROUP BY s.branch_code, s.agregado, s.period`,
    [inicio, fim],
  );
  const consumo = new Map<string, number>();
  for (const row of consumoRows.rows) {
    const valor = Number(row.consumo);
    if (Number.isFinite(valor)) consumo.set(`${row.branch}|${row.agregado}|${row.period}`, valor);
  }
  // Estoque da Indústria = soma das fotos do ÚLTIMO período com fotografia,
  // por produto, agregada no final (paridade com a versão validada).
  const estoqueRows = await portalPool.query<{ branch: string; agregado: string; saldo: string }>(
    `WITH fotos AS (
        SELECT r.branch_code,
               COALESCE(nullif(r.aggregate_product_code, ''), r.product_code) AS agregado,
               (r.normalized_payload->>'year') || lpad(r.normalized_payload->>'month', 2, '0') AS period,
               SUM((r.normalized_payload->>'totalValue')::numeric) AS saldo
          FROM public.operational_source_rows r
          JOIN public.operational_import_batches b ON b.id = r.batch_id
         WHERE b.status = 'processed' AND b.source_kind = 'FECHAMENTO_ESTOQUE'
           AND r.branch_code IS NOT NULL AND r.product_code IS NOT NULL
           AND r.normalized_payload->>'totalValue' ~ '${REGEX_NUM}'
         GROUP BY 1, 2, 3
     ),
     ultimo AS (SELECT max(period) AS period FROM fotos)
     SELECT f.branch_code AS branch, f.agregado, SUM(f.saldo) AS saldo
       FROM fotos f JOIN ultimo u ON f.period = u.period
      GROUP BY f.branch_code, f.agregado`,
  );
  const estoqueAgregado = new Map<string, number>();
  for (const row of estoqueRows.rows) {
    const valor = Number(row.saldo);
    if (Number.isFinite(valor)) estoqueAgregado.set(`${row.branch}|${row.agregado}`, valor);
  }
  cacheConsumoIndustria.set(chave, { consumo, estoqueAgregado, gravadoEm: Date.now() });
  return { consumo, estoqueAgregado };
}
// Anexa o consumo por agregado aos meses dos itens da Indústria e devolve o
// estoque agregado da última fotografia para o chamador.
async function attachIndustryMonthlyConsumption(
  portalPool: ReturnType<typeof getSupabasePool>,
  result: { periodos?: Array<{ period: string }>; items?: Array<{ filial?: string; cod_agregado?: string | null; codigo: string; meses: Array<Record<string, unknown>> }> },
): Promise<Map<string, number>> {
  const periods = (result.periodos ?? []).map(item => normalizeSalesPeriod(item.period)).filter((item): item is string => item != null).sort();
  if (!periods.length) return new Map();
  const { consumo, estoqueAgregado } = await obterConsumoIndustria(portalPool, periods);
  for (const item of result.items ?? []) {
    const branch = item.filial ?? INDUSTRY_BRANCH;
    const aggregateVariants = [...codeVariants(item.cod_agregado), ...codeVariants(item.codigo)];
    for (const month of item.meses) {
      const period = normalizeSalesPeriod(String(month.period ?? ""));
      if (!period || month.valor_consumo != null) continue;
      const value = aggregateVariants.map(aggregate => consumo.get(`${branch}|${aggregate}|${period}`)).find(item => item != null);
      month.valor_consumo = value ?? null;
    }
  }
  return estoqueAgregado;
}
async function getCurrentCurveLookup(
  businessPool: ReturnType<typeof getBusinessPool>,
  portalPool: ReturnType<typeof getSupabasePool>,
  segment: CostEvolutionSegment | undefined,
  branch: string | null,
) {
  const rows: Array<{ code: string; codeOriginal?: string | null; branchCode: string; curve: string }> = [];
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
  if (segment !== "industry") {
    try {
      // A coluna a.curve é o enum inventory_curve; cast ::text obrigatório.
      const result = await businessPool.query<{ code: string; codeOriginal: string | null; branchCode: string; curve: string }>(
        `select trim(a.code) as code,
                nullif(trim(a."codeOriginal"), '') as "codeOriginal",
                trim(a.branch) as "branchCode",
                trim(a.curve::text) as curve
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
            and a.curve::text in ('A', 'B', 'C', 'D', 'E')`,
        [branch],
      );
      for (const row of result.rows) {
        rows.push(row);
        if (row.codeOriginal && row.codeOriginal !== row.code) {
          rows.push({ code: row.codeOriginal, branchCode: row.branchCode, curve: row.curve });
        }
      }
    } catch {
      // Uma base sem o histórico de Compras continua sem vínculo (anomalia a corrigir na origem).
    }
  }
  return buildCostCurveLookup(rows);
}
// ————— Pipeline comum (consolidado e itens usam o mesmo motor) —————
type ParamsBase = {
  segment?: CostEvolutionSegment;
  periodoInicio?: string;
  periodoFim?: string;
  filial?: string;
  codAgregado?: string;
  descricao?: string;
};
async function obterBase(params: ParamsBase, limites: LimitesAlerta) {
  const businessPool = getBusinessPool();
  const portalPool = getSupabasePool();
  const filial = params.segment === "industry" && !params.filial?.trim() ? INDUSTRY_BRANCH : (params.filial ?? null);
  const { rows } = await businessPool.query(
    `select get_cost_evolution($1, $2, $3, $4, $5) as result`,
    [params.periodoInicio ?? null, params.periodoFim ?? null, filial, params.codAgregado ?? null, params.descricao ?? null],
  );
  const result = rows[0]?.result ?? { periodos: [], items: [] };
  // B-v13 (20/10/2026): SEGMENTO HERMÉTICO — no Autopeças a filial da
  // Indústria (0105) jamais entra; o item da Indústria tem a própria tela.
  if (params.segment !== "industry" && Array.isArray(result.items)) {
    result.items = result.items.filter((item: { filial?: string }) => String(item.filial ?? "") !== INDUSTRY_BRANCH);
  }
  const estoqueIndustria = params.segment === "industry"
    ? await attachIndustryMonthlyConsumption(portalPool, result)
    : null;
  if (params.segment !== "industry") {
    await attachAutoPartsMonthlySales(businessPool, result);
    await attachAutoPartsEstoque(businessPool, result);
  }
  const curves = await getCurrentCurveLookup(businessPool, portalPool, params.segment, filial);
  const periods: string[] = ((result.periodos ?? []) as Array<{ period: string }>)
    .map((entry: { period: string }) => normalizeSalesPeriod(String(entry.period)))
    .filter((entry): entry is string => entry != null)
    .sort();
  // Índices oficiais: completa o cache e calcula IPCA acumulado e variação do dólar.
  const statusIndices = await garantirIndicesEconomicos(portalPool, periods);
  const mapas = await getIndicesEconomicos(portalPool, periods);
  type ValorIndice = { valor: number; valorFechamento: number | null };
  let ipcaPercent: number | null = null;
  const mesesIpca = periods
    .map((period: string) => mapas.IPCA.get(period))
    .filter((valor): valor is ValorIndice => valor != null);
  if (periods.length && mesesIpca.length === periods.length) {
    const fator = mesesIpca.reduce((acc: number, mes: ValorIndice) => acc * (1 + mes.valor / 100), 1);
    ipcaPercent = (fator - 1) * 100;
  }
  let dolarVariationPercent: number | null = null;
  const primeiroDolar = periods[0] ? mapas.DOLAR.get(periods[0]) : null;
  const ultimoDolar = periods[periods.length - 1] ? mapas.DOLAR.get(periods[periods.length - 1]) : null;
  if (primeiroDolar?.valorFechamento && ultimoDolar?.valorFechamento && primeiroDolar.valorFechamento > 0) {
    dolarVariationPercent = ((ultimoDolar.valorFechamento - primeiroDolar.valorFechamento) * 100) / primeiroDolar.valorFechamento;
  }
  const benchmarks: Partial<Record<"IPCA" | "IGPM" | "DOLAR_PTAX", number>> = {};
  if (ipcaPercent != null) benchmarks.IPCA = Number(ipcaPercent.toFixed(4));
  if (dolarVariationPercent != null) benchmarks.DOLAR_PTAX = Number(dolarVariationPercent.toFixed(4));
  const analisado = attachCostBenchmarkReport(result, curves, params.segment ?? "auto_parts", benchmarks);
  const items = (analisado.items ?? []) as ItemInterno[];
  enriquecerItens(items, params.segment ?? "auto_parts");
  if (params.segment === "industry" && estoqueIndustria) {
    for (const item of items) {
      const branch = item.filial ?? INDUSTRY_BRANCH;
      const variants = [...codeVariants(item.cod_agregado), ...codeVariants(item.codigo)];
      const achado = variants.map(variant => estoqueIndustria.get(`${branch}|${variant}`)).find(valor => valor != null);
      if (achado != null) item.estoqueAgregado = achado;
    }
  }
  // B-v12: régua de ferro — sem custo médio no período, o item NÃO entra.
  // Quem tem consumo mas não tem preço é contado no diagnóstico (anomalia).
  const segmentEfetivo = params.segment ?? "auto_parts";
  const consumoSemPreco = items.filter(item => temConsumoSemPreco(item, segmentEfetivo)).length;
  const itemsComBase = items.filter(item => temCustoReal(item));
  // O cruzamento por curva é recalculado na API consolidada SOBRE o conjunto
  // FILTRADO — um único motor para cards e painel. Aqui ficam os comparativos.
  const relatorio = analisado.benchmarkReport as unknown as Record<string, unknown>;
  relatorio.ipcaPercent = ipcaPercent;
  relatorio.dolarVariationPercent = dolarVariationPercent;
  relatorio.indicesStatus = { IPCA: statusIndices.IPCA, DOLAR: statusIndices.DOLAR };
  relatorio.indicesDetalhes = statusIndices.detalhes;
  relatorio.diagnosticoBase = {
    itensNaBase: items.length,
    itensComBase: itemsComBase.length,
    itensExcluidos: items.length - itemsComBase.length,
    consumoSemPreco,
  };
  return { analisado, items: itemsComBase, periods, limites };
}
// Busca multi-termo: TODAS as palavras devem aparecer na descrição OU no código
// do agregado ("pneu 600" acha "PNEU DIAGONAL 600/50-22,5").
function filtrarPorDescricao(items: ItemInterno[], descricao?: string, searchType?: string): ItemInterno[] {
  const termo = (descricao ?? "").trim().toLowerCase();
  if (!termo) return items;
  const tipo = searchType ?? "contem";
  if (tipo === "inicia") return items.filter(item => (item.descricao ?? "").toLowerCase().startsWith(termo));
  if (tipo === "termina") return items.filter(item => (item.descricao ?? "").toLowerCase().endsWith(termo));
  const termos = termo.split(/\s+/).filter(Boolean);
  return items.filter(item => {
    const texto = (item.descricao ?? "").toLowerCase();
    const codigo = String(item.cod_agregado ?? "").toLowerCase();
    return termos.every(t => texto.includes(t) || codigo.includes(t));
  });
}
// Custo total: consumo/venda do período × custo médio, deduplicado por
// filial|agregado|mês (o consumo é por AGREGADO — não soma em dobro).
function calcularCustoTotal(items: ItemInterno[], segment: CostEvolutionSegment): number {
  const porChave = new Map<string, number>();
  for (const item of items) {
    const chaveItem = `${item.filial ?? ""}|${(item.cod_agregado ?? item.codigo).trim()}`;
    for (const mes of item.meses) {
      const valor = consumoMensalEmReais(mes, segment);
      if (valor == null) continue;
      const chave = `${chaveItem}|${mes.period}`;
      if (!porChave.has(chave)) porChave.set(chave, valor);
    }
  }
  const total = Array.from(porChave.values()).reduce((acc, valor) => acc + valor, 0);
  return Number(total.toFixed(2));
}
// ————— API 1: análise consolidada (KBs — fim do timeout) —————
export async function getCostEvolutionAnalise(params: ParamsBase & { searchType?: string; limitesAlerta?: Partial<LimitesAlerta> | null }) {
  const limites = sanitizarLimites(params.limitesAlerta);
  const { analisado, items, periods, limites: limitesAplicados } = await obterBase(params, limites);
  const segment = params.segment ?? "auto_parts";
  const filtrados = filtrarPorDescricao(items, params.descricao, params.searchType);
  const custoTotal = calcularCustoTotal(filtrados, segment);
  let comCusto = 0, alta = 0, reducao = 0;
  let somaImpacto = 0;
  const contagemAcima: Record<string, number> = {};
  const impactoPorCurva: Record<string, number> = {};
  const consumoPorCurva: Record<string, number> = {};
  const chavesConsumoCurva: Record<string, Set<string>> = {};
  const itensPorCurva: Record<string, number> = {};
  for (const item of filtrados) {
    const valores = serieCusto(item, periods).filter((valor): valor is number => valor != null);
    if (valores.length) {
      comCusto += 1;
      if (valores[valores.length - 1] > valores[0]) alta += 1;
      else if (valores[valores.length - 1] < valores[0]) reducao += 1;
    }
    if (!item.curve || item.costStatus === "SEM_BASE_CUSTO") continue;
    itensPorCurva[item.curve] = (itensPorCurva[item.curve] ?? 0) + 1;
    const variacao = item.variacaoPercent;
    if (variacao != null) {
      const limite = limites[item.curve as keyof LimitesAlerta] ?? LIMITES_PADRAO[item.curve as keyof LimitesAlerta];
      if (Math.abs(variacao) >= limite) contagemAcima[item.curve] = (contagemAcima[item.curve] ?? 0) + 1;
    }
    if (item.impactoEstimado != null) {
      impactoPorCurva[item.curve] = (impactoPorCurva[item.curve] ?? 0) + item.impactoEstimado;
      somaImpacto += item.impactoEstimado;
    }
    // Consumo da curva, deduplicado por filial|agregado|mês (mesma régua do
    // custo total) — base da variação ponderada por curva.
    const chaves = chavesConsumoCurva[item.curve] ?? (chavesConsumoCurva[item.curve] = new Set());
    const chaveItem = `${item.filial ?? ""}|${(item.cod_agregado ?? item.codigo).trim()}`;
    for (const mes of item.meses) {
      const valor = consumoMensalEmReais(mes, segment);
      if (valor == null) continue;
      const chave = `${chaveItem}|${mes.period}`;
      if (!chaves.has(chave)) {
        chaves.add(chave);
        consumoPorCurva[item.curve] = (consumoPorCurva[item.curve] ?? 0) + valor;
      }
    }
  }
  // Triângulo que fecha — Variação ponderada × Custo total = Impacto estimado.
  const variacaoPonderada = custoTotal > 0 ? Number(((somaImpacto / custoTotal) * 100).toFixed(4)) : null;
  const byCurveNovo: Record<string, { itemCount: number; itemsWithBase: number; averageVariationPercent: number | null; weightedVariationPercent?: number | null; estimatedImpact: number | null; highAlerts: number }> = {};
  for (const curve of Object.keys(itensPorCurva)) {
    const consumo = consumoPorCurva[curve] ?? 0;
    const impacto = impactoPorCurva[curve] ?? 0;
    byCurveNovo[curve] = {
      itemCount: itensPorCurva[curve],
      itemsWithBase: itensPorCurva[curve],
      averageVariationPercent: null,
      weightedVariationPercent: consumo > 0 ? Number(((impacto / consumo) * 100).toFixed(4)) : null,
      estimatedImpact: Number(impacto.toFixed(2)),
      highAlerts: contagemAcima[curve] ?? 0,
    };
  }
  const relatorio = analisado.benchmarkReport as unknown as Record<string, unknown>;
  relatorio.byCurve = byCurveNovo; // só curvas com itens — fim das linhas 0,00
  relatorio.weightedMonthlyVariationPercent = variacaoPonderada;
  relatorio.internalInflationPercent = null; // pílula "Interna" removida (mesmo conceito da variação ponderada)
  return {
    periodos: analisado.periodos ?? [],
    periodoEfetivoInicio: periods[0] ?? null,
    periodoEfetivoFim: periods[periods.length - 1] ?? null,
    cards: { custoTotal, comCusto, alta, reducao },
    benchmarkReport: analisado.benchmarkReport,
    limites: limitesAplicados,
  };
}
// ————— API 2: itens paginados (grid sob demanda) —————
export type CriterioItens = "todos" | "acima-limite" | "alta" | "reducao" | "sem-base" | "sem-curva" | "curva-A" | "curva-B" | "curva-C" | "curva-D" | "curva-E";
// B-v12: ordenação estendida (filial e curva) com direção asc/desc —
// clicar no cabeçalho do grid alterna crescente/decrescente.
export type OrdenacaoItens = "impacto" | "variacao" | "codigo" | "descricao" | "filial" | "curva";
export type DirecaoOrdenacao = "asc" | "desc";
export type CurvaFiltro = "A" | "B" | "C" | "D" | "E";
export async function getCostEvolutionItens(params: ParamsBase & {
  searchType?: string;
  limitesAlerta?: Partial<LimitesAlerta> | null;
  curvaFiltro?: CurvaFiltro;
  pagina?: number;
  itensPorPagina?: number;
  ordenacao?: OrdenacaoItens;
  direcao?: DirecaoOrdenacao;
  criterio?: CriterioItens;
}) {
  const limites = sanitizarLimites(params.limitesAlerta);
  const { items } = await obterBase(params, limites);
  let lista = filtrarPorDescricao(items, params.descricao, params.searchType);
  if (params.curvaFiltro) lista = lista.filter(item => item.curve === params.curvaFiltro);
  const criterio = params.criterio ?? "todos";
  if (criterio === "sem-base") lista = lista.filter(item => item.costStatus === "SEM_BASE_CUSTO");
  else if (criterio === "sem-curva") lista = lista.filter(item => item.costStatus === "CURVA_NAO_VINCULADA");
  else if (criterio === "alta") lista = lista.filter(item => (item.variacaoPercent ?? 0) > 0);
  else if (criterio === "reducao") lista = lista.filter(item => (item.variacaoPercent ?? 0) < 0);
  else if (criterio === "acima-limite") {
    lista = lista.filter(item => {
      if (!item.curve || item.costStatus === "SEM_BASE_CUSTO" || item.variacaoPercent == null) return false;
      const limite = limites[item.curve as keyof LimitesAlerta] ?? LIMITES_PADRAO[item.curve as keyof LimitesAlerta];
      return Math.abs(item.variacaoPercent) >= limite;
    });
  } else if (criterio.startsWith("curva-")) {
    const curva = criterio.replace("curva-", "").toUpperCase();
    lista = lista.filter(item => item.curve === curva);
  }
  const ordenacao = params.ordenacao ?? "impacto";
  const direcao = params.direcao === "asc" ? "asc" : "desc";
  const fator = direcao === "asc" ? 1 : -1;
  lista = [...lista].sort((a, b) => {
    if (ordenacao === "variacao") return fator * ((a.variacaoPercent ?? -Infinity) - (b.variacaoPercent ?? -Infinity));
    if (ordenacao === "impacto") return fator * ((a.impactoEstimado ?? -Infinity) - (b.impactoEstimado ?? -Infinity));
    if (ordenacao === "filial") return fator * String(a.filial ?? "").localeCompare(String(b.filial ?? ""));
    if (ordenacao === "curva") return fator * String(a.curve ?? "").localeCompare(String(b.curve ?? ""));
    if (ordenacao === "descricao") return fator * String(a.descricao ?? "").localeCompare(String(b.descricao ?? ""));
    return fator * String(a.codigo).localeCompare(String(b.codigo));
  });
  const total = lista.length;
  const itensPorPagina = Math.min(200, Math.max(10, params.itensPorPagina ?? 50));
  const pagina = Math.max(1, params.pagina ?? 1);
  const inicio = (pagina - 1) * itensPorPagina;
  return { total, pagina, itensPorPagina, limites, items: lista.slice(inicio, inicio + itensPorPagina) };
}
// ————— Agregados com descrição (combo pesquisável) —————
export async function getCodAgregadosComDescricao() {
  const pool = getBusinessPool();
  const { rows } = await pool.query<{ cod_agregado: string; descricao: string }>(
    `select cr.cod_agregado, max(cr.descricao) as descricao
       from public.cost_records cr
      where cr.cod_agregado is not null and trim(cr.cod_agregado) <> ''
      group by cr.cod_agregado
      order by cr.cod_agregado`,
  );
  return rows;
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