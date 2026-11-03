// ============================================================
// costEvolutionAnalise.ts — MOTOR da Evolução de Custos
// ============================================================
// B-v15 (23/10/2026) — REGRAS DE NEGÓCIO DEFINIDAS PELO USUÁRIO:
//  (1) HERANÇA DO CUSTO MÉDIO: custo médio 0 na planilha = mês SEM movimento.
//      O item HERDA o custo médio do último mês que teve custo calculado.
//      O CONSUMO NUNCA É INVENTADO — só o custo médio é transportado.
//  (2) O FILTRO DE PERÍODO MANDA: se no período selecionado o item não tem
//      nenhum dado, ele NÃO aparece.
//  (3) ITEM SEM CURVA NÃO CALCULA E NÃO MOSTRA — é anomalia de origem.
//  (4) PRÉ-CÁLCULO: o resultado é materializado no banco na importação.
// ============================================================
//
// ORIGEM DA CURVA ABC — POR SEGMENTO (deliberadamente diferentes):
//   AUTOPEÇAS → public."inventoryAnalytics" (Compras Protheus)
//               colunas: branch, code, "codeOriginal", curve (enum)
//               ~322 mil registros. É a MESMA base da Sugestão de Compras.
//               A tabela sbz_product_curves NÃO é usada pelo Autopeças.
//   INDÚSTRIA → public.sbz_product_curves (ABC Indústria)
//               operation='INDUSTRIA', is_current=true, ~4.252 registros.
//   CHAVE DE VÍNCULO: filial + código (com e sem zeros à esquerda).
// ============================================================
import { getBusinessPool, getSupabasePool } from "./supabasePortal";
import { getCostSourcePool } from "./costSourcePool";
import { attachCostBenchmarkReport } from "./costEvolutionBenchmarkAdapter";
import { streamCostSourceRows } from "./costSourceCursor";
import { buildSb9CostSourceQuery } from "./sb9CostQuery";
import { resolveSb9CostReadSource } from "./sb9CostSource";
import { calculateWeightedMonthlyCost, materializeCalendarMonths, type WeightedCurve } from "./costWeightedMonthly";
import { buildCostSalesHistoryIndex, buildCostSalesHistoryIndexFromFacts, costSalesCodeAliases, getCostSalesHistoryQuantity, normalizeCostSalesBranch, normalizeCostSalesPeriod, type CostSalesHistoryRow } from "./costSalesHistory";
import { buildCostCurveLookup } from "./costCurveLookup";
import { addLatestHistoricalCostCurves } from "./costCurveHistory";
import { filterCostEvolutionItems, scopeCostEvolutionItems, typedAggregateSearch } from "./costEvolutionItemFilter";
import { garantirIndicesEconomicos, getIndicesEconomicos } from "./economicIndices";
import { getPurchaseSalesMonthlyHead, isPurchaseSalesMonthlySnapshotCurrent, readPurchaseSalesMonthlyFacts } from "./purchaseSalesMonthlyStore";
type CostEvolutionSegment = "auto_parts" | "industry";
const INDUSTRY_BRANCH = "0105";
// B-v14 (22/10/2026): 0105 (Indústria) e 0201 jamais aparecem no Autopeças
// nem no Compras — decisão do usuário, válida em TODAS as telas do portal.
const FILIAIS_EXCLUIDAS_AUTOPECAS = new Set(["0105", "0201"]);
function normalizeSalesPeriod(value: string): string | null {
  return normalizeCostSalesPeriod(value);
}
function codeVariants(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const normalized = raw.replace(/^0+(?=\d)/, "");
  const withoutSystemSuffix = raw.replace(/[-_]([A-Za-z]+)$/, "");
  const withoutSystemSuffixNormalized = withoutSystemSuffix.replace(/^0+(?=\d)/, "");
  return Array.from(new Set([raw, normalized, withoutSystemSuffix, withoutSystemSuffixNormalized]));
}
export function mesmoProdutoSb9(item: { filial?: string; codigo: string }, branch: string, product: string): boolean {
  return codeVariants(item.filial).some(value => codeVariants(branch).includes(value)) &&
    codeVariants(item.codigo).some(value => codeVariants(product).includes(value));
}
function previousPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));
  return month === 1 ? `${year - 1}12` : `${year}${String(month - 1).padStart(2, "0")}`;
}
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
export type MesInterno = { period: string; custo_medio: number | null; quantidade_vendida?: number | null; valor_consumo?: number | null; custo_herdado?: boolean };
type ItemInterno = {
  codigo: string; descricao?: string; filial?: string; cod_agregado?: string | null;
  curve?: string; costStatus?: string;
  estoque?: number | null; estoqueValor?: number | null; estoqueAgregado?: number | null;
  variacaoPercent?: number | null; impactoEstimado?: number | null; consumoMedioMensal?: number | null;
  consumoTotal?: number | null; consumoMedioQuantidade?: number | null; consumoTotalQuantidade?: number | null;
  meses: MesInterno[];
};
// B-v15: SÉRIE COM HERANÇA — o custo médio de um mês sem movimento é o do
// último mês que teve custo calculado. O consumo NÃO é herdado.
function serieCusto(item: ItemInterno, periods: string[]): (number | null)[] {
  const values = new Map(item.meses.map(mes => [mes.period, mes.custo_medio]));
  let anterior: number | null = null;
  return periods.map(period => {
    const atual = values.get(period);
    if (atual != null && atual !== 0) anterior = atual;
    return anterior;
  });
}
// B-v15: aplica a herança DIRETO nos meses do item, para que o consumo em
// reais (quantidade × custo) use o custo herdado. Só o custo é transportado.
export function aplicarHerancaDeCusto(item: ItemInterno, periods: string[]): void {
  const serie = serieCusto(item, periods);
  const porPeriodo = new Map(periods.map((period, index) => [period, serie[index]]));
  for (const mes of item.meses) {
    if (mes.custo_medio != null && mes.custo_medio !== 0) {
      mes.custo_herdado = false;
      continue;
    }
    const herdado = porPeriodo.get(mes.period);
    if (herdado != null) {
      mes.custo_medio = herdado;
      mes.custo_herdado = true;
    }
  }
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
// B-v15: o custo usado aqui já vem herdado; a QUANTIDADE nunca é inventada.
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
    if (variacaoPercent != null && consumoTotal != null) {
      impactoEstimado = consumoTotal * (variacaoPercent / 100);
    }
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
// B-v15: RÉGUA DE FERRO — item sem NENHUM custo médio no período não entra.
function temCustoReal(item: ItemInterno): boolean {
  return item.meses.some(mes => mes.custo_medio != null && mes.custo_medio !== 0);
}
function temConsumoSemPreco(item: ItemInterno, segment: CostEvolutionSegment): boolean {
  if (temCustoReal(item)) return false;
  return item.meses.some(mes => consumoMensalEmReais(mes, segment) != null);
}
export async function attachAutoPartsMonthlySales(
  businessPool: ReturnType<typeof getBusinessPool>,
  result: { items?: Array<{ filial?: string; cod_agregado?: string | null; codigo: string; meses: Array<Record<string, unknown>> }> },
) {
  const items = result.items ?? [];
  if (!items.length) return;
  let sales: ReturnType<typeof buildCostSalesHistoryIndex>;
  try {
    const head = await getPurchaseSalesMonthlyHead(businessPool);
    const periods = [...new Set(items.flatMap(item => item.meses.map(month => normalizeSalesPeriod(String(month.period ?? ""))).filter((period): period is string => period != null)))];
    const branches = [...new Set(items.map(item => normalizeCostSalesBranch(item.filial)).filter(Boolean))];
    const codes = [...new Set(items.flatMap(item => [
      ...costSalesCodeAliases(item.cod_agregado),
      ...costSalesCodeAliases(item.codigo),
    ]))];
    if (head?.status === "ready" && await isPurchaseSalesMonthlySnapshotCurrent(businessPool)) {
      const facts = await readPurchaseSalesMonthlyFacts(businessPool, { versionId: head.versionId, branches, codes, periods });
      sales = buildCostSalesHistoryIndexFromFacts(facts);
      for (const item of items) {
        for (const month of item.meses) {
          const aggregateQuantity = item.cod_agregado
            ? getCostSalesHistoryQuantity(sales, item.filial, item.cod_agregado, month.period)
            : null;
          month.quantidade_vendida = aggregateQuantity ?? getCostSalesHistoryQuantity(sales, item.filial, item.codigo, month.period);
        }
      }
      return;
    }
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
    if (code !== "42P01") throw error;
  }
  const rows = await businessPool.query<CostSalesHistoryRow>(
    `select trim(a.branch) as branch,
            trim(a.code) as code,
            nullif(trim(a."codeOriginal"), '') as "codeOriginal",
            a."salesMonths" as "salesMonths",
            i."importedAt" as "importedAt",
            i.id as "importId", a.id as "rowId"
       from public."inventoryAnalytics" a
       join public."protheusImports" i on i.id = a."importId"
      where i.status = 'approved'
        and a."salesMonths" is not null
        and a."salesMonths" <> '{}'::jsonb
      order by i."importedAt" desc, i.id desc, a.id`,
  );
  sales = buildCostSalesHistoryIndex(rows.rows);
  for (const item of items) {
    for (const month of item.meses) {
      // Zero válido permanece zero; apenas ausência permite fallback por produto.
      const aggregateQuantity = item.cod_agregado
        ? getCostSalesHistoryQuantity(sales, item.filial, item.cod_agregado, month.period)
        : null;
      month.quantidade_vendida = aggregateQuantity ?? getCostSalesHistoryQuantity(sales, item.filial, item.codigo, month.period);
    }
  }
}
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

/**
 * A importação manual da SB9 é a fonte operacional oficial dos custos mensais.
 * Bases antigas ainda podem retornar parte dos itens por get_cost_evolution,
 * mas não devem esconder itens que só existem em operational_source_rows.
 */
export async function attachSb9MonthlyCosts(
  portalPool: ReturnType<typeof getSupabasePool>,
  result: { periodos?: Array<{ period: string }>; items?: Array<{ filial?: string; cod_agregado?: string | null; codigo: string; descricao?: string; meses: Array<Record<string, unknown>> }> },
  params: { periodoInicio?: string; periodoFim?: string; filial?: string | null; codAgregado?: string },
) {
  const inicio = normalizeSalesPeriod(params.periodoInicio ?? "") ?? null;
  const fim = normalizeSalesPeriod(params.periodoFim ?? "") ?? null;
  const requestedAggregate = params.codAgregado?.trim();
  const aggregateCodes = requestedAggregate ? [requestedAggregate] : null;
  // Catálogo separado, sem DISTINCT/ORDER BY sobre toda a tabela operacional.
  const catalog = await portalPool.query<{ product: string; aggregate: string | null; importedAt: Date | string; sourceRow: number; description?: string | null }>(
    `select trim(r.product_code) as product,
            nullif(trim(r.aggregate_product_code), '') as aggregate,
            b.imported_at as "importedAt", r.source_row_number as "sourceRow",
            nullif(trim(r.normalized_payload->>'description'), '') as description
       from public.operational_import_batches b
       join public.operational_source_rows r on r.batch_id = b.id
      where b.id = (
          select id from public.operational_import_batches
           where status = 'processed' and source_kind = 'SB1'
           order by imported_at desc, id desc limit 1
        )
        and r.product_code is not null
        and ($1::text[] is null
          or r.aggregate_product_code = any($1::text[])
          or r.product_code = any($1::text[]))`,
    [aggregateCodes],
  );
  const aggregates = new Map<string, { code: string | null; time: number; sourceRow: number; description: string }>();
  for (const row of catalog.rows) {
    const time = new Date(row.importedAt).getTime();
    const current = aggregates.get(row.product);
    if (!current || time > current.time || (time === current.time && row.sourceRow > current.sourceRow)) {
      aggregates.set(row.product, { code: row.aggregate, time, sourceRow: row.sourceRow, description: row.description?.trim() || "" });
    }
  }
  const requestedProducts = requestedAggregate ? [...new Set([
    ...[...aggregates].filter(([product, metadata]) => (metadata.code || product) === requestedAggregate).map(([product]) => product),
    ...(result.items ?? []).filter(item => (item.cod_agregado?.trim() || item.codigo.trim()) === requestedAggregate).map(item => item.codigo.trim()),
  ])] : null;
  const requestedProductSet = requestedProducts ? new Set(requestedProducts) : null;
  const source = await resolveSb9CostReadSource(portalPool);
  if (!source) return;
  const query = buildSb9CostSourceQuery(source.source, {
    batchId: source.batchId,
    periodStart: inicio,
    periodEnd: fim,
    branch: params.filial?.trim() || null,
    productCodes: requestedProducts,
  });
  const records = streamCostSourceRows<{ branch: string; product: string; period: string; cost: string }>(
    portalPool,
    query.text,
    query.values,
  );
  const periods = new Set(
    ((result.periodos ?? []) as Array<{ period: string }>)
      .map(item => normalizeSalesPeriod(String(item.period)))
      .filter((period): period is string => period != null),
  );
  const items = result.items ?? (result.items = []);
  const porProduto = new Map<string, (typeof items)[number] | null>();
  const chaveProduto = (branch: unknown, code: string) => `${String(branch ?? "").trim().padStart(4, "0")}|${code}`;
  const indexarProduto = (item: (typeof items)[number]) => {
    for (const code of codeVariants(item.codigo)) {
      const key = chaveProduto(item.filial, code);
      if (!porProduto.has(key)) porProduto.set(key, item);
      else if (porProduto.get(key) !== item) porProduto.set(key, null);
    }
  };
  for (const item of items) indexarProduto(item);
  const findItem = (branch: string, product: string) => {
    for (const code of codeVariants(product)) {
      const item = porProduto.get(chaveProduto(branch, code));
      if (item) return item;
    }
    return undefined;
  };

  const monthlyCost = new WeakMap<object, Map<string, number>>();
  for await (const row of records) {
    const period = normalizeSalesPeriod(row.period);
    const observedCost = Number(row.cost);
    if (!period || !Number.isFinite(observedCost)) continue;
    const aggregate = aggregates.get(row.product)?.code ?? row.product;
    // Guarda anterior ao matching de aliases: um item de outro agregado não
    // pode sobrescrever o custo de um membro legítimo via código parecido.
    if (requestedProductSet && !requestedProductSet.has(row.product)) continue;
    periods.add(period);
    let item = findItem(row.branch, row.product);
    if (!item) {
      item = { filial: row.branch, codigo: row.product, cod_agregado: aggregate, descricao: aggregates.get(row.product)?.description || "", meses: [] };
      items.push(item);
      indexarProduto(item);
    }
    const catalogDescription = aggregates.get(row.product)?.description;
    if (catalogDescription && (!item.descricao?.trim() || item.descricao.trim() === item.codigo)) {
      item.descricao = catalogDescription;
    }
    let costs = monthlyCost.get(item);
    if (!costs) { costs = new Map(); monthlyCost.set(item, costs); }
    // Preserva a regra anterior de MAX por produto/mês, mas sem sort/hash no SQL.
    const maximum = Math.max(costs.get(period) ?? -Infinity, observedCost);
    costs.set(period, maximum);
    const existing = item.meses.find(month => normalizeSalesPeriod(String(month.period ?? '')) === period);
    if (existing) {
      existing.custo_medio = maximum;
      existing.custo_herdado = false;
    } else {
      item.meses.push({ period, custo_medio: maximum, custo_herdado: false });
    }
  }
  result.periodos = Array.from(periods).sort().map(period => ({ period }));
}
// MAPA DE COLUNAS DAS FONTES DE CONSUMO DA INDÚSTRIA:
//   FECHAMENTO_ESTOQUE → period = normalized_payload->>'year' + lpad(month,2,'0')
//                        saldo  = normalized_payload->>'totalValue'
//   ENTRADA_NF         → period = substring(normalized_payload->>'entryDate',1,7)
//                        valor  = quantity × itemValue
const REGEX_NUM = "^-?[0-9]+(\\.[0-9]+)?$";
type ConsumoIndustria = { consumo: Map<string, number>; estoqueAgregado: Map<string, number>; gravadoEm: number };
const CACHE_CONSUMO_TTL_MS = 10 * 60 * 1000;
const cacheConsumoIndustria = new Map<string, ConsumoIndustria>();
export async function obterConsumoIndustria(
  portalPool: ReturnType<typeof getSupabasePool>,
  periods: string[],
  branch: string = INDUSTRY_BRANCH,
): Promise<{ consumo: Map<string, number>; estoqueAgregado: Map<string, number> }> {
  const chave = `${branch}:${periods[0]}:${periods[periods.length - 1]}`;
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
           AND r.branch_code = $3 AND r.product_code IS NOT NULL
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
           AND r.branch_code = $3 AND r.product_code IS NOT NULL
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
    [inicio, fim, branch],
  );
  const consumo = new Map<string, number>();
  for (const row of consumoRows.rows) {
    const valor = Number(row.consumo);
    if (Number.isFinite(valor)) {
      for (const code of codeVariants(row.agregado)) consumo.set(`${row.branch.trim().padStart(4, "0")}|${code}|${row.period}`, valor);
    }
  }
  const estoqueRows = await portalPool.query<{ branch: string; agregado: string; saldo: string }>(
    `WITH fotos AS (
        SELECT r.branch_code,
               COALESCE(nullif(r.aggregate_product_code, ''), r.product_code) AS agregado,
               (r.normalized_payload->>'year') || lpad(r.normalized_payload->>'month', 2, '0') AS period,
               SUM((r.normalized_payload->>'totalValue')::numeric) AS saldo
          FROM public.operational_source_rows r
          JOIN public.operational_import_batches b ON b.id = r.batch_id
         WHERE b.status = 'processed' AND b.source_kind = 'FECHAMENTO_ESTOQUE'
           AND r.branch_code = $1 AND r.product_code IS NOT NULL
           AND r.normalized_payload->>'totalValue' ~ '${REGEX_NUM}'
         GROUP BY 1, 2, 3
     ),
     ultimo AS (SELECT max(period) AS period FROM fotos)
     SELECT f.branch_code AS branch, f.agregado, SUM(f.saldo) AS saldo
       FROM fotos f JOIN ultimo u ON f.period = u.period
      GROUP BY f.branch_code, f.agregado`,
    [branch],
  );
  const estoqueAgregado = new Map<string, number>();
  for (const row of estoqueRows.rows) {
    const valor = Number(row.saldo);
    if (Number.isFinite(valor)) estoqueAgregado.set(`${row.branch}|${row.agregado}`, valor);
  }
  cacheConsumoIndustria.set(chave, { consumo, estoqueAgregado, gravadoEm: Date.now() });
  return { consumo, estoqueAgregado };
}
async function attachIndustryMonthlyConsumption(
  portalPool: ReturnType<typeof getSupabasePool>,
  result: { periodos?: Array<{ period: string }>; items?: Array<{ filial?: string; cod_agregado?: string | null; codigo: string; meses: Array<Record<string, unknown>> }> },
): Promise<Map<string, number>> {
  const periods = (result.periodos ?? []).map(item => normalizeSalesPeriod(item.period)).filter((item): item is string => item != null).sort();
  if (!periods.length) return new Map();
  const { consumo, estoqueAgregado } = await obterConsumoIndustria(portalPool, periods);
  for (const item of result.items ?? []) {
    const branch = String(item.filial ?? INDUSTRY_BRANCH).trim().padStart(4, "0");
    const aggregateVariants = [...codeVariants(item.cod_agregado), ...codeVariants(item.codigo)];
    for (const month of item.meses) {
      const period = normalizeSalesPeriod(String(month.period ?? ""));
      if (!period) continue;
      const value = aggregateVariants.map(aggregate => consumo.get(`${branch}|${aggregate}|${period}`)).find(item => item != null);
      month.valor_consumo = value ?? null;
    }
  }
  return estoqueAgregado;
}
// B-v15: ORIGEM DA CURVA POR SEGMENTO — ver bloco de documentação no topo.
async function getCurrentCurveLookup(
  businessPool: ReturnType<typeof getBusinessPool>,
  portalPool: ReturnType<typeof getSupabasePool>,
  segment: CostEvolutionSegment | undefined,
  branch: string | null,
  items: Array<{ filial?: string; cod_agregado?: string | null; codigo: string }> = [],
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
      // Uma base sem o histórico de Compras continua sem vínculo.
    }
  }
  const currentLookup = buildCostCurveLookup(rows);
  if (segment !== "industry") {
    try {
      return await addLatestHistoricalCostCurves(
        businessPool,
        currentLookup,
        items.map(item => ({
          branchCode: item.filial ?? "",
          aggregateCode: item.cod_agregado,
          productCode: item.codigo,
        })),
      );
    } catch (error) {
      console.error("[Custos] Fallback histórico de curvas indisponível; mantendo vínculos atuais", error);
    }
  }
  return currentLookup;
}
type ParamsBase = {
  segment?: CostEvolutionSegment;
  periodoInicio?: string;
  periodoFim?: string;
  filial?: string;
  codAgregado?: string;
  descricao?: string;
};
async function carregarBase(params: ParamsBase, limites: LimitesAlerta) {
  const typedAggregate = !params.codAgregado?.trim() ? typedAggregateSearch(params.descricao) : null;
  if (typedAggregate) params = { ...params, codAgregado: typedAggregate, descricao: undefined };
  const businessPool = getBusinessPool();
  const portalPool = getCostSourcePool();
  const filial = params.segment === "industry" && !params.filial?.trim() ? INDUSTRY_BRANCH : (params.filial ?? null);
  const { rows } = await businessPool.query(
    `select get_cost_evolution($1, $2, $3, $4, $5) as result`,
    [params.periodoInicio ?? null, params.periodoFim ?? null, filial, params.codAgregado ?? null, params.descricao ?? null],
  );
  const result = rows[0]?.result ?? { periodos: [], items: [] };
  // B-v13: SEGMENTO HERMÉTICO — no Autopeças a filial da Indústria (0105)
  // jamais entra; o item da Indústria tem a própria tela.
  if (params.segment !== "industry" && Array.isArray(result.items)) {
    result.items = result.items.filter((item: { filial?: string }) => !FILIAIS_EXCLUIDAS_AUTOPECAS.has(String(item.filial ?? "")));
  }
  try {
    await attachSb9MonthlyCosts(portalPool, result, { periodoInicio: params.periodoInicio, periodoFim: params.periodoFim, filial, codAgregado: params.codAgregado });
  } catch (error) {
    // A SB9 indisponível não pode derrubar a análise legada. O erro fica no log
    // para diagnóstico, enquanto a consulta antiga continua sendo apresentada.
    console.warn("[Custos] SB9 não incorporada à evolução", error instanceof Error ? error.message : error);
  }
  // A SB9 acrescenta produtos depois do filtro SQL. Não permitir que esse
  // enriquecimento reintroduza outras filiais/agregados nos cartões ou grid.
  result.items = scopeCostEvolutionItems(result.items ?? [], { codAgregado: params.codAgregado, filial });
  const periodosDisponiveis = (result.periodos ?? []).map((entry: { period: string }) => normalizeSalesPeriod(String(entry.period))).filter((period: string | null): period is string => period != null).sort();
  const inicioEfetivo = normalizeSalesPeriod(params.periodoInicio ?? "") ?? periodosDisponiveis[0];
  const fimEfetivo = normalizeSalesPeriod(params.periodoFim ?? "") ?? periodosDisponiveis[periodosDisponiveis.length - 1];
  const calendario = inicioEfetivo && fimEfetivo ? materializeCalendarMonths([inicioEfetivo, fimEfetivo]) : [];
  result.periodos = calendario.map(period => ({ period }));
  for (const item of result.items ?? []) {
    const porMes = new Map<string, Record<string, unknown>>();
    for (const month of item.meses ?? []) {
      const period = normalizeSalesPeriod(String(month.period ?? ""));
      if (period) porMes.set(period, { ...month, period });
    }
    item.meses = calendario.map(period => porMes.get(period) ?? { period, custo_medio: null });
  }
  if (params.segment !== "industry") {
    result.items = (result.items ?? []).filter((item: { filial?: string }) => !FILIAIS_EXCLUIDAS_AUTOPECAS.has(String(item.filial ?? "").padStart(4, "0")));
  }
  const estoqueIndustria = params.segment === "industry"
    ? await attachIndustryMonthlyConsumption(portalPool, result)
    : null;
  if (params.segment !== "industry") {
    await attachAutoPartsMonthlySales(businessPool, result);
    await attachAutoPartsEstoque(businessPool, result);
  }
  const curves = await getCurrentCurveLookup(businessPool, portalPool, params.segment, filial, result.items ?? []);
  const periods: string[] = ((result.periodos ?? []) as Array<{ period: string }>)
    .map((entry: { period: string }) => normalizeSalesPeriod(String(entry.period)))
    .filter((entry): entry is string => entry != null)
    .sort();
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
  // B-v15: HERANÇA DO CUSTO MÉDIO antes de enriquecer — o consumo em reais
  // passa a usar o custo herdado do último mês com valor calculado.
  for (const item of items) aplicarHerancaDeCusto(item, periods);
  enriquecerItens(items, params.segment ?? "auto_parts");
  if (params.segment === "industry" && estoqueIndustria) {
    for (const item of items) {
      const branch = item.filial ?? INDUSTRY_BRANCH;
      const variants = [...codeVariants(item.cod_agregado), ...codeVariants(item.codigo)];
      const achado = variants.map(variant => estoqueIndustria.get(`${branch}|${variant}`)).find(valor => valor != null);
      if (achado != null) item.estoqueAgregado = achado;
    }
  }
  // B-v15: RÉGUA DE FERRO — sem custo médio no período, o item NÃO entra.
  const segmentEfetivo = params.segment ?? "auto_parts";
  const consumoSemPreco = items.filter(item => temConsumoSemPreco(item, segmentEfetivo)).length;
  const itemsComBase = items.filter(item => temCustoReal(item));
  // B-v15: ITEM SEM CURVA NÃO CALCULA E NÃO MOSTRA (regra do usuário).
  // Aplicado nos dois segmentos: se a exportação está correta, não haverá
  // item sem curva; se aparecer, é anomalia real que deve ficar visível.
  const curvasPermitidas = params.segment === "industry" ? ["A", "B", "C"] : ["A", "B", "C", "D", "E"];
  const itemsComCurva = itemsComBase.filter(item => curvasPermitidas.includes(item.curve ?? ""));
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
    itensSemCurva: itemsComBase.length - itemsComCurva.length,
  };
  return { analisado, items: itemsComCurva, periods, limites };
}
const basesEmAndamento = new Map<string, ReturnType<typeof carregarBase>>();
async function obterBase(params: ParamsBase, limites: LimitesAlerta) {
  const chave = JSON.stringify([params.segment ?? "auto_parts", params.periodoInicio ?? null, params.periodoFim ?? null, params.filial ?? null, params.codAgregado ?? null, params.descricao ?? null, limites]);
  const existente = basesEmAndamento.get(chave);
  if (existente) return existente;
  const tarefa = carregarBase(params, limites);
  basesEmAndamento.set(chave, tarefa);
  try {
    return await tarefa;
  } finally {
    basesEmAndamento.delete(chave);
  }
}
// Custo total: soma item a item e mês a mês de consumo/venda × custo médio.
// A quantidade mensal do agregado é aplicada a cada item do agregado, conforme
// a regra de negócio da análise; não deduplicar por filial|agregado|mês.
export function calcularCustoTotal(items: ItemInterno[], segment: CostEvolutionSegment): number {
  let total = 0;
  const consumoIndustrialContado = new Set<string>();
  for (const item of items) {
    for (const mes of item.meses) {
      const valor = consumoMensalEmReais(mes, segment);
      if (valor == null) continue;
      if (segment === "industry") {
        const chave = `${item.filial ?? INDUSTRY_BRANCH}|${item.cod_agregado ?? item.codigo}|${mes.period}`;
        if (consumoIndustrialContado.has(chave)) continue;
        consumoIndustrialContado.add(chave);
      }
      total += valor;
    }
  }
  return Number(total.toFixed(2));
}
export async function getCostEvolutionAnalise(params: ParamsBase & { searchType?: string; limitesAlerta?: Partial<LimitesAlerta> | null }) {
  const limites = sanitizarLimites(params.limitesAlerta);
  const { analisado, items, periods, limites: limitesAplicados } = await obterBase(params, limites);
  const segment = params.segment ?? "auto_parts";
  const filtrados = filterCostEvolutionItems(items, params.descricao, params.searchType);
  const custoTotal = calcularCustoTotal(filtrados, segment);
  let comCusto = 0, alta = 0, reducao = 0;
  let somaImpacto = 0;
  const contagemAcima: Record<string, number> = {};
  const impactoPorCurva: Record<string, number> = {};
  const consumoPorCurva: Record<string, number> = {};
  const itensPorCurva: Record<string, number> = {};
  const consumoIndustrialContado = new Set<string>();
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
    for (const mes of item.meses) {
      const valor = consumoMensalEmReais(mes, segment);
      if (valor == null) continue;
      if (segment === "industry") {
        const chave = `${item.filial ?? INDUSTRY_BRANCH}|${item.cod_agregado ?? item.codigo}|${mes.period}`;
        if (consumoIndustrialContado.has(chave)) continue;
        consumoIndustrialContado.add(chave);
      }
      consumoPorCurva[item.curve] = (consumoPorCurva[item.curve] ?? 0) + valor;
    }
  }
  const ponderado = calculateWeightedMonthlyCost({
    segment,
    periods,
    aggregates: filtrados.filter(item => Boolean(item.curve)).map(item => ({
      branch: item.filial ?? "",
      aggregateCode: item.cod_agregado ?? item.codigo,
      curve: item.curve as WeightedCurve,
      monthlyCosts: Object.fromEntries(item.meses.map(mes => [mes.period, mes.custo_medio])),
      monthlyWeights: Object.fromEntries(item.meses.map(mes => [mes.period, segment === "industry" ? mes.valor_consumo : mes.quantidade_vendida])),
    })),
  });
  const variacaoPonderada = ponderado.total.weight > 0 ? Number(ponderado.total.weightedVariationPercent.toFixed(4)) : null;
  const byCurveNovo: Record<string, { itemCount: number; itemsWithBase: number; averageVariationPercent: number | null; weightedVariationPercent?: number | null; estimatedImpact: number | null; highAlerts: number }> = {};
  for (const curve of Object.keys(itensPorCurva)) {
    const consumo = consumoPorCurva[curve] ?? 0;
    const impacto = impactoPorCurva[curve] ?? 0;
    byCurveNovo[curve] = {
      itemCount: itensPorCurva[curve],
      itemsWithBase: itensPorCurva[curve],
      averageVariationPercent: null,
      weightedVariationPercent: (ponderado.byCurve[curve]?.weight ?? 0) > 0 ? Number(ponderado.byCurve[curve].weightedVariationPercent.toFixed(4)) : null,
      estimatedImpact: Number(impacto.toFixed(2)),
      highAlerts: contagemAcima[curve] ?? 0,
    };
  }
  const relatorio = analisado.benchmarkReport as unknown as Record<string, unknown>;
  relatorio.byCurve = byCurveNovo;
  relatorio.weightedMonthlyVariationPercent = variacaoPonderada;
  relatorio.internalInflationPercent = null;
  return {
    periodos: analisado.periodos ?? [],
    periodoEfetivoInicio: periods[0] ?? null,
    periodoEfetivoFim: periods[periods.length - 1] ?? null,
    cards: { custoTotal, comCusto, alta, reducao },
    benchmarkReport: analisado.benchmarkReport,
    limites: limitesAplicados,
  };
}
export type CriterioItens = "todos" | "acima-limite" | "alta" | "reducao" | "sem-base" | "sem-curva" | "curva-A" | "curva-B" | "curva-C" | "curva-D" | "curva-E";
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
  let lista = filterCostEvolutionItems(items, params.descricao, params.searchType);
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
