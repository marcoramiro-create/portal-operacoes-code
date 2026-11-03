import type { Pool } from "pg";
import {
  buildCostCurveLookup,
  curveLookupKey,
  findMissingCurveCodes,
  mergeCostCurveLookups,
  type CurveCode,
  type CurveLookup,
  type CurveLookupItem,
} from "./costCurveLookup";

type AutoHistoryCache = {
  latestImportId: string;
  curves: Map<string, CurveCode | null>;
};
const autoHistoryCache = new WeakMap<object, AutoHistoryCache>();

/**
 * Busca a última classificação previamente aprovada somente para pares que não
 * têm curva na fonte atual. Somente classificações de cargas aprovadas são
 * consideradas; prévias ou importações não aprovadas nunca viram fallback.
 * O resultado por chave fica em cache até surgir uma nova carga aprovada.
 */
export async function addLatestHistoricalCostCurves(
  pool: Pick<Pool, "query">,
  current: CurveLookup,
  items: CurveLookupItem[],
): Promise<CurveLookup> {
  const missing = findMissingCurveCodes(items, current);
  if (missing.length === 0) return current;

  const latest = await pool.query<{ id: string }>(
    `select id::text as id
       from public."protheusImports"
      where status = 'approved'
      order by "importedAt" desc, id desc
      limit 1`,
  );
  const latestImportId = latest.rows[0]?.id;
  if (!latestImportId) return current;

  const previous = autoHistoryCache.get(pool as object);
  const cache: AutoHistoryCache = previous?.latestImportId === latestImportId
    ? previous
    : { latestImportId, curves: new Map() };
  autoHistoryCache.set(pool as object, cache);

  const uncached = missing.filter(row => !cache.curves.has(curveLookupKey(row.branchCode, row.code)));
  if (uncached.length) {
    const result = await pool.query<{
      code: string;
      branchCode: string;
      curve: string;
    }>(
      `with requested as (
         select trim(branch_code) as branch_code, trim(code) as code
           from unnest($1::text[], $2::text[]) as r(branch_code, code)
       ), candidates as (
         select requested.branch_code as "branchCode",
                requested.code,
                trim(a.curve::text) as curve,
                i."importedAt" as "importedAt",
                i.id as "importId",
                a.id as "rowId"
           from requested
           join public."inventoryAnalytics" a
             on regexp_replace(trim(a.branch), '^0+', '') = regexp_replace(requested.branch_code, '^0+', '')
            and (
              regexp_replace(trim(a.code), '^0+', '') = regexp_replace(requested.code, '^0+', '')
              or regexp_replace(coalesce(nullif(trim(a."codeOriginal"), ''), ''), '^0+', '') = regexp_replace(requested.code, '^0+', '')
            )
           join public."protheusImports" i on i.id = a."importId"
          where i.status = 'approved'
            and a.curve::text in ('A', 'B', 'C', 'D', 'E')
       )
       select distinct on ("branchCode", code)
              code, "branchCode", curve
         from candidates
        order by "branchCode", code, "importedAt" desc, "importId" desc, "rowId" desc`,
      [uncached.map(row => row.branchCode), uncached.map(row => row.code)],
    );

    for (const row of uncached) cache.curves.set(curveLookupKey(row.branchCode, row.code), null);
    for (const row of result.rows) {
      cache.curves.set(curveLookupKey(row.branchCode, row.code), row.curve as CurveCode);
    }
  }

  const historical = buildCostCurveLookup(missing.flatMap(row => {
    const curve = cache.curves.get(curveLookupKey(row.branchCode, row.code));
    return curve ? [{ code: row.code, branchCode: row.branchCode, curve }] : [];
  }));
  return mergeCostCurveLookups(current, historical);
}

/** Último snapshot industrial válido por filial+código ainda sem vínculo atual. */
export async function addLatestHistoricalIndustryCurves(
  pool: Pick<Pool, "query">,
  current: CurveLookup,
  items: CurveLookupItem[],
): Promise<CurveLookup> {
  const missing = findMissingCurveCodes(items, current);
  if (missing.length === 0) return current;

  const result = await pool.query<{
    code: string;
    branchCode: string;
    curve: string;
  }>(
    `with requested as (
       select trim(branch_code) as branch_code, trim(code) as code
         from unnest($1::text[], $2::text[]) as r(branch_code, code)
     ), candidates as (
       select requested.branch_code as "branchCode",
              requested.code,
              c.curve_code as curve,
              c.reference_period as "referencePeriod",
              c.calculated_at as "calculatedAt",
              c.id as "curveId"
         from requested
         join public.sbz_product_curves c
           on c.operation = 'INDUSTRIA'
          and c.is_current = true
          and regexp_replace(trim(c.branch_code), '^0+', '') = regexp_replace(requested.branch_code, '^0+', '')
         left join public.products p on p.id = c.product_id
        where c.curve_code in ('A', 'B', 'C')
          and (
            regexp_replace(coalesce(nullif(trim(c.metadata->>'aggregateCode'), ''), ''), '^0+', '') = regexp_replace(requested.code, '^0+', '')
            or regexp_replace(coalesce(nullif(trim(p.source_product_code), ''), ''), '^0+', '') = regexp_replace(requested.code, '^0+', '')
            or regexp_replace(trim(p.product_code), '^0+', '') = regexp_replace(requested.code, '^0+', '')
          )
     )
     select distinct on ("branchCode", code) code, "branchCode", curve
       from candidates
      order by "branchCode", code, "referencePeriod" desc, "calculatedAt" desc, "curveId" desc`,
    [missing.map(row => row.branchCode), missing.map(row => row.code)],
  );

  const historical = buildCostCurveLookup(result.rows);
  return mergeCostCurveLookups(current, historical);
}
