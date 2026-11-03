export type CurveCode = "A" | "B" | "C" | "D" | "E";

export type CurveLookupRow = {
  code: string | null;
  branchCode: string | null;
  curve: string | null;
};

export type CurveLookup = Record<string, CurveCode>;

export type CurveLookupItem = {
  branchCode: string | null | undefined;
  aggregateCode?: string | null;
  productCode: string;
};

const normalize = (value: string | null | undefined) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const [numeric, ...suffix] = text.split("-");
  const normalizedNumeric = numeric.replace(/^0+(?=\d)/, "");
  return suffix.length > 0 ? `${normalizedNumeric}-${suffix.join("-")}` : normalizedNumeric;
};

export const curveLookupKey = (branchCode: string | null | undefined, code: string) =>
  `${normalize(branchCode)}|${normalize(code)}`;

/**
 * Indexa a curva pela mesma chave usada pelos itens da evolução:
 * filial + código do produto. Nunca usa uma chave global quando há filiais,
 * pois o mesmo produto pode ter curva diferente por filial.
 */
export function buildCostCurveLookup(rows: CurveLookupRow[]): CurveLookup {
  const lookup: CurveLookup = {};
  for (const row of rows) {
    const code = normalize(row.code);
    const curve = normalize(row.curve) as CurveCode;
    if (!code || !["A", "B", "C", "D", "E"].includes(curve)) continue;
    const branch = normalize(row.branchCode);
    if (!branch) continue;
    lookup[curveLookupKey(branch, code)] = curve;
  }
  return lookup;
}

export function findCostCurve(lookup: CurveLookup, branchCode: string | null | undefined, code: string) {
  return lookup[curveLookupKey(branchCode, code)];
}

/**
 * Retorna somente os códigos ainda não encontrados na curva prioritária.
 * O agregado é investigado primeiro; o código do produto é consultado como
 * fallback quando não há curva atual para o agregado.
 */
export function findMissingCurveCodes(items: CurveLookupItem[], current: CurveLookup) {
  const missing = new Map<string, { branchCode: string; code: string }>();
  for (const item of items) {
    const branchCode = String(item.branchCode ?? "").trim();
    const aggregateCode = String(item.aggregateCode ?? "").trim();
    const productCode = String(item.productCode ?? "").trim();
    if (!branchCode || !productCode) continue;

    const aggregateCurve = aggregateCode ? findCostCurve(current, branchCode, aggregateCode) : undefined;
    const productCurve = findCostCurve(current, branchCode, productCode);
    if (aggregateCurve || productCurve) continue;
    if (aggregateCode) {
      missing.set(curveLookupKey(branchCode, aggregateCode), { branchCode, code: aggregateCode });
    }
    missing.set(curveLookupKey(branchCode, productCode), { branchCode, code: productCode });
  }
  return Array.from(missing.values());
}

/** Curvas primárias nunca são substituídas pelo resultado de um fallback. */
export function mergeCostCurveLookups(current: CurveLookup, fallback: CurveLookup): CurveLookup {
  return { ...fallback, ...current };
}
