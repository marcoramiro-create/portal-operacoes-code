export type QualitySeverity = "INFO" | "WARNING" | "ERROR";

export type QualityIssue = {
  code: string;
  severity: QualitySeverity;
  entity: string;
  key?: string;
  message: string;
};

export type QualityReport = {
  score: number;
  status: "OK" | "ATENCAO" | "BLOQUEADO";
  issues: QualityIssue[];
  counts: { info: number; warning: number; error: number };
};

type Product = { code: string; active?: boolean };
type BranchProduct = { productCode: string; branchCode: string; active?: boolean };
type SupplierLink = { supplierCode: string; store: string; externalProductCode: string; internalProductCode?: string; active?: boolean };
type Supplier = { code: string; store: string; active?: boolean };
type OrderLine = { orderNumber: string; productCode: string; branchCode: string; quantity?: number; openQuantity?: number };

type Input = {
  products?: Product[];
  branchProducts?: BranchProduct[];
  suppliers?: Supplier[];
  supplierLinks?: SupplierLink[];
  orders?: OrderLine[];
  expectedSources?: string[];
  loadedSources?: Record<string, number>;
};

function issue(issues: QualityIssue[], value: QualityIssue) { issues.push(value); }
function duplicateKeys<T>(rows: T[], keyOf: (row: T) => string): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(keyOf(row), (counts.get(keyOf(row)) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
}

export function buildOperationalDataQualityReport(input: Input): QualityReport {
  const issues: QualityIssue[] = [];
  const products = input.products ?? [];
  const branchProducts = input.branchProducts ?? [];
  const suppliers = input.suppliers ?? [];
  const links = input.supplierLinks ?? [];
  const orders = input.orders ?? [];
  const productCodes = new Set(products.map(row => row.code));
  const activeProductCodes = new Set(products.filter(row => row.active !== false).map(row => row.code));
  const supplierKeys = new Set(suppliers.map(row => `${row.code}|${row.store}`));

  for (const key of duplicateKeys(products, row => row.code)) {
    issue(issues, { code: "DUPLICATE_PRODUCT", severity: "ERROR", entity: "SB1", key, message: `Produto duplicado na chave ${key}.` });
  }
  for (const key of duplicateKeys(branchProducts, row => `${row.branchCode}|${row.productCode}`)) {
    issue(issues, { code: "DUPLICATE_BRANCH_PRODUCT", severity: "ERROR", entity: "SBZ", key, message: `Produto duplicado na filial ${key}.` });
  }
  for (const key of duplicateKeys(links, row => `${row.supplierCode}|${row.store}|${row.externalProductCode}`)) {
    issue(issues, { code: "AMBIGUOUS_SA5", severity: "ERROR", entity: "SA5", key, message: `Mais de uma amarração SA5 ativa para ${key}.` });
  }
  for (const row of branchProducts) {
    if (!productCodes.has(row.productCode)) issue(issues, { code: "SBZ_WITHOUT_SB1", severity: "ERROR", entity: "SBZ", key: `${row.branchCode}|${row.productCode}`, message: "Registro SBZ sem produto correspondente na SB1." });
    else if (!activeProductCodes.has(row.productCode)) issue(issues, { code: "SBZ_INACTIVE_PRODUCT", severity: "WARNING", entity: "SBZ", key: row.productCode, message: "SBZ referencia produto inativo." });
  }
  for (const row of links) {
    if (row.active === false) continue;
    if (!supplierKeys.has(`${row.supplierCode}|${row.store}`)) issue(issues, { code: "SA5_WITHOUT_SA2", severity: "ERROR", entity: "SA5", key: `${row.supplierCode}|${row.store}`, message: "Amarração SA5 sem fornecedor ativo correspondente na SA2." });
    if (!row.internalProductCode) issue(issues, { code: "SA5_WITHOUT_INTERNAL_PRODUCT", severity: "ERROR", entity: "SA5", key: row.externalProductCode, message: "Amarração SA5 sem produto interno resolvido." });
    else if (!productCodes.has(row.internalProductCode)) issue(issues, { code: "SA5_PRODUCT_NOT_FOUND", severity: "ERROR", entity: "SA5", key: row.internalProductCode, message: "Produto interno da SA5 não existe na SB1." });
  }
  for (const row of orders) {
    if (!productCodes.has(row.productCode)) issue(issues, { code: "ORDER_PRODUCT_NOT_FOUND", severity: "ERROR", entity: "SC7", key: `${row.orderNumber}|${row.productCode}`, message: "Pedido referencia produto ausente na SB1." });
    if (!row.quantity || row.quantity < 0) issue(issues, { code: "ORDER_INVALID_QUANTITY", severity: "ERROR", entity: "SC7", key: row.orderNumber, message: "Pedido possui quantidade inválida." });
    if (row.openQuantity !== undefined && row.openQuantity < 0) issue(issues, { code: "ORDER_INVALID_OPEN_QUANTITY", severity: "ERROR", entity: "SC7", key: row.orderNumber, message: "Pedido possui saldo aberto negativo." });
  }
  for (const source of input.expectedSources ?? []) {
    const count = input.loadedSources?.[source] ?? 0;
    if (count === 0) issue(issues, { code: "SOURCE_EMPTY", severity: "WARNING", entity: source, message: `A fonte ${source} não possui registros carregados.` });
  }

  const counts = {
    info: issues.filter(item => item.severity === "INFO").length,
    warning: issues.filter(item => item.severity === "WARNING").length,
    error: issues.filter(item => item.severity === "ERROR").length,
  };
  const total = Math.max(1, issues.length);
  const score = Math.max(0, Math.round(100 - counts.error * 12 - counts.warning * 3));
  return { score: Math.min(100, score), status: counts.error > 0 ? "BLOQUEADO" : counts.warning > 0 ? "ATENCAO" : "OK", issues, counts };
}
