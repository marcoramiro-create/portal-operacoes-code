import type { FamilyCatalogRow, Sb1Row } from "./protheusCatalogParsers";

export type ClassificationKind = "FAMILIA" | "SUBFAMILIA";
export type ClassificationInput = FamilyCatalogRow & { kind: ClassificationKind };
export type ClassificationPlan = {
  classifications: ClassificationInput[];
  links: { productCode: string; kind: ClassificationKind; classificationCode: string }[];
  issues: { productCode: string; kind: ClassificationKind; code: string; message: string }[];
};

/**
 * Monta a camada derivada sem tocar no banco. A SB1 é a ponte entre produto e
 * os catálogos ZFM/ZSF; códigos são comparados como texto, sem remover zeros.
 */
export function buildClassificationMaterializationPlan(input: {
  families: FamilyCatalogRow[];
  subfamilies: FamilyCatalogRow[];
  products: Pick<Sb1Row, "productCode" | "family" | "subfamily">[];
}): ClassificationPlan {
  const classifications: ClassificationInput[] = [
    ...input.families.map(row => ({ ...row, kind: "FAMILIA" as const })),
    ...input.subfamilies.map(row => ({ ...row, kind: "SUBFAMILIA" as const })),
  ];
  const byKey = new Map(classifications.map(row => [`${row.kind}|${row.code}`, row]));
  const issues: ClassificationPlan["issues"] = [];
  const links: ClassificationPlan["links"] = [];
  const seenLinks = new Set<string>();

  for (const product of input.products) {
    const pairs: [ClassificationKind, string][] = [
      ["FAMILIA", product.family.trim()],
      ["SUBFAMILIA", product.subfamily.trim()],
    ];
    for (const [kind, code] of pairs) {
      if (!code) {
        issues.push({ productCode: product.productCode, kind, code, message: "Produto SB1 sem classificação." });
        continue;
      }
      if (!byKey.has(`${kind}|${code}`)) {
        issues.push({ productCode: product.productCode, kind, code, message: "Código da SB1 não encontrado no catálogo OneDrive." });
        continue;
      }
      const linkKey = `${product.productCode}|${kind}`;
      if (!seenLinks.has(linkKey)) {
        links.push({ productCode: product.productCode, kind, classificationCode: code });
        seenLinks.add(linkKey);
      }
    }
  }

  return { classifications, links, issues };
}
