export type CurveCode = "A" | "B" | "C" | "D" | "E";

export type CurveLookupRow = {
  code: string | null;
  branchCode: string | null;
  curve: string | null;
};

export type CurveLookup = Record<string, CurveCode>;

const normalize = (value: string | null | undefined) => String(value ?? "").trim();

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
