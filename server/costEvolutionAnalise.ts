// ============================================================
// costEvolutionAnalise.ts
// Ponte entre o portal e as funções SQL de evolução de custos.
// B1 (18/10/2026): a análise devolve SOMENTE o consolidado (períodos, cards no
// servidor, relatório ABC com limites configuráveis, IPCA/PTAX); os itens viram
// chamada própria paginada (getCostEvolutionItens). Resposta em KBs — fim do timeout.
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
// ————— Limites de alerta configuráveis (B1) —————
export type LimitesAlerta = { A: number; B: number; C: number; D: number; E: number };
export const LIMITES_PADRAO: LimitesAlerta = { A: 10, B: 15, C: 20, D: 20, E: 20 };
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
// Consumo em R$ por mês: Indústria = valor_consumo (já é R$ por agregado);
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
function enriquecerItens(items: ItemInterno[], segment: CostEvolutionSegment): void {
  for (const item of items) {
    const variacaoPercent = variacaoDoItem(item);
    const consumoMedioMensal = consumoMedioDoItem(item, segment);
    const { inicial, final } = extremosDoCusto(item);
    let impactoEstimado: number | null = null;
    if (variacaoPercent != null && consumoMedioMensal != null && inicial != null && final != null) {
      impactoEstimado = (final - inicial) * consumoMedioMensal;
    }
    item.variacaoPercent = variacaoPercent == null ? null : Number(variacaoPercent.toFixed(4));
    item.impactoEstimado = impactoEstimado == null ? null : Number(impactoEstimado.toFixed(2));
    item.consumoMedioMensal = consumoMedioMensal == null ? null : Number(consumoMedioMensal.toFixed(2));
  }
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
// B1: estoque do Autopeças — fotografia da última importação aprovada de Compras
// (inventoryAnalytics.stock / stockValue, por agregado), até saldos atualizados.
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
async function attachIndustryMonthlyConsumption(
  portalPool: ReturnType<typeof getSupabasePool>,
  result: { periodos?: Array<{ period: string }>; items?: Array<{ filial?: string; cod_agregado?: string | null; codigo: string; meses: Array<Record<string, unknown>> }> },
  estoqueOut?: Map<string, number>,
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
  // B1: estoque da Indústria = ÚLTIMA fotografia de FECHAMENTO_ESTOQUE, somada
  // por agregado (regra do usuário: quando houver saldos atualizados, será este).
  if (estoqueOut) {
    const periodsStock = Array.from(stock.keys()).map(key => key.split("|")[2]).filter((period): period is string => period != null).sort();
    const ultimaFotografia = periodsStock[periodsStock.length - 1];
    if (ultimaFotografia) {
      for (const [productKey, aggregate] of aggregateByProduct) {
        const branch = productKey.split("|")[0];
        const valor = stock.get(`${productKey}|${ultimaFotografia}`);
        if (valor != null) estoqueOut.set(`${branch}|${aggregate}`, (estoqueOut.get(`${branch}|${aggregate}`) ?? 0) + valor);
      }
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
  const estoqueIndustria = new Map<string, number>();
  if (params.segment === "industry") await attachIndustryMonthlyConsumption(portalPool, result, estoqueIndustria);
  else {
    await attachAutoPartsMonthlySales(businessPool, result);
    await attachAutoPartsEstoque(businessPool, result);
  }
  const curves = await getCurrentCurveLookup(businessPool, portalPool, params.segment, filial);
  // CORREÇÃO tsc 18/10: tipos explícitos na extração dos períodos do SQL.
  const periods: string[] = ((result.periodos ?? []) as Array<{ period: string }>)
    .map((entry: { period: string }) => normalizeSalesPeriod(String(entry.period)))
    .filter((entry): entry is string => entry != null)
    .sort();
  // Índices oficiais: completa o cache e calcula IPCA acumulado (composição
  // das variações mensais) e variação do dólar (fechamento último vs primeiro mês).
  const statusIndices = await garantirIndicesEconomicos(portalPool, periods);
  const mapas = await getIndicesEconomicos(portalPool, periods);
  // CORREÇÃO tsc 18/10: tipos explícitos no valor do Map e no reduce do IPCA.
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
  // Mesmo sem curvas, anexa o relatório para que a interface mostre o diagnóstico.
  const analisado = attachCostBenchmarkReport(result, curves, params.segment ?? "auto_parts", benchmarks);
  const items = (analisado.items ?? []) as ItemInterno[];
  enriquecerItens(items, params.segment ?? "auto_parts");
  if (params.segment === "industry") {
    for (const item of items) {
      const branch = item.filial ?? INDUSTRY_BRANCH;
      const variants = [...codeVariants(item.cod_agregado), ...codeVariants(item.codigo)];
      const achado = variants.map(variant => estoqueIndustria.get(`${branch}|${variant}`)).find(valor => valor != null);
      if (achado != null) item.estoqueAgregado = achado;
    }
  }
  // Limites configuráveis: recalcula "Itens acima do limite" por curva.
  const byCurve = (analisado.benchmarkReport.byCurve ?? {}) as Record<string, { highAlerts?: number } | undefined>;
  const contagem: Record<string, number> = {};
  for (const item of items) {
    if (!item.curve || item.costStatus === "SEM_BASE_CUSTO") continue;
    const variacao = variacaoDoItem(item);
    if (variacao == null) continue;
    const limite = limites[item.curve as keyof LimitesAlerta] ?? LIMITES_PADRAO[item.curve as keyof LimitesAlerta];
    if (Math.abs(variacao) >= limite) contagem[item.curve] = (contagem[item.curve] ?? 0) + 1;
  }
  for (const curve of Object.keys(byCurve)) {
    if (byCurve[curve]) byCurve[curve]!.highAlerts = contagem[curve] ?? 0;
  }
  const relatorio = analisado.benchmarkReport as unknown as Record<string, unknown>;
  relatorio.ipcaPercent = ipcaPercent;
  relatorio.dolarVariationPercent = dolarVariationPercent;
  relatorio.indicesStatus = statusIndices;
  return { analisado, items, periods, limites };
}
function filtrarPorDescricao(items: ItemInterno[], descricao?: string, searchType?: string): ItemInterno[] {
  const termo = (descricao ?? "").trim().toLowerCase();
  if (!termo) return items;
  const tipo = searchType ?? "contem";
  return items.filter(item => {
    const texto = (item.descricao ?? "").toLowerCase();
    if (tipo === "inicia") return texto.startsWith(termo);
    if (tipo === "termina") return texto.endsWith(termo);
    return texto.includes(termo);
  });
}
// Custo total (decisão do usuário): consumo/venda do período × custo médio.
// O consumo é por AGREGADO — deduplicado por filial|agregado|mês (primeira
// ocorrência vence) para não somar o mesmo consumo em itens diferentes do agregado.
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
  const filtrados = filtrarPorDescricao(items, params.descricao, params.searchType);
  let comCusto = 0, alta = 0, reducao = 0;
  for (const item of filtrados) {
    const valores = serieCusto(item, periods).filter((valor): valor is number => valor != null);
    if (!valores.length) continue;
    comCusto += 1;
    if (valores[valores.length - 1] > valores[0]) alta += 1;
    else if (valores[valores.length - 1] < valores[0]) reducao += 1;
  }
  return {
    periodos: analisado.periodos ?? [],
    periodoEfetivoInicio: periods[0] ?? null,
    periodoEfetivoFim: periods[periods.length - 1] ?? null,
    cards: {
      custoTotal: calcularCustoTotal(filtrados, params.segment ?? "auto_parts"),
      comCusto, alta, reducao,
    },
    benchmarkReport: analisado.benchmarkReport,
    limites: limitesAplicados,
  };
}
// ————— API 2: itens paginados (grid sob demanda) —————
export type CriterioItens = "todos" | "acima-limite" | "alta" | "reducao" | "sem-base" | "sem-curva" | "curva-A" | "curva-B" | "curva-C" | "curva-D" | "curva-E";
export type OrdenacaoItens = "impacto" | "variacao" | "codigo" | "descricao";
export async function getCostEvolutionItens(params: ParamsBase & {
  searchType?: string;
  limitesAlerta?: Partial<LimitesAlerta> | null;
  pagina?: number;
  itensPorPagina?: number;
  ordenacao?: OrdenacaoItens;
  criterio?: CriterioItens;
}) {
  const limites = sanitizarLimites(params.limitesAlerta);
  const { items } = await obterBase(params, limites);
  let lista = filtrarPorDescricao(items, params.descricao, params.searchType);
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
  lista = [...lista].sort((a, b) => {
    if (ordenacao === "variacao") return Math.abs(b.variacaoPercent ?? -Infinity) - Math.abs(a.variacaoPercent ?? -Infinity);
    if (ordenacao === "impacto") return Math.abs(b.impactoEstimado ?? -Infinity) - Math.abs(a.impactoEstimado ?? -Infinity);
    if (ordenacao === "descricao") return String(a.descricao ?? "").localeCompare(String(b.descricao ?? ""));
    return String(a.codigo).localeCompare(String(b.codigo));
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