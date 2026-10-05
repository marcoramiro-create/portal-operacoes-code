// Auditoria de cruzamentos das cargas operacionais centralizadas.
// REGRA DE NEGÓCIO (validada com Marco): serviço SOMENTE LEITURA — não altera
// dados existentes, não grava em banco e não consome fontes externas.
// REGRA DE NEGÓCIO: evitar joins que multipliquem linhas — a auditoria usa
// apenas EXISTÊNCIA de chaves (Sets/Maps de contagem), nunca produto cartesiano.
// REGRA DE NEGÓCIO: códigos de produto preservam zeros à esquerda e caracteres
// alfanuméricos (normalizeProductCode); filiais são normalizadas para 4 dígitos
// (normalizeBranchCode), também preservando zeros à esquerda.
// REGRA DE NEGÓCIO: SB1 é o cadastro base de produtos; SBZ é a ampliação por
// código+filial; Pedidos cruzam por produto+filial; Estoque cruza por
// produto/agregado+filial (quando o agregado está disponível).
// REGRA DE NEGÓCIO: todo produto possui um código agregado; um agregado reúne
// N produtos (1:N). A classificação separa DIRETO (código do produto),
// AGREGADO (via Cod Agregado), NAO_ENCONTRADO e DUPLICADO/AMBIGUO.
import type { NfLegalSourceRow, PurchaseOrderSourceRow, StockEvolutionSourceRow } from "./operationalSourceParsers";
import type { Sa2Row, Sb1Row, Sb5Row, SbzRow } from "./protheusCatalogParsers";
import { cleanSourceText, normalizeBranchCode, normalizeProductCode } from "./operationalNormalization";

export type AuditMatchKind = "DIRETO" | "AGREGADO" | "NAO_ENCONTRADO";

export type AuditSourceMetric = {
  source: string;
  total: number;
  direct: number;
  aggregate: number;
  notFound: number;
  ambiguous: number;
  matchRate: number;
};

export type AuditException = {
  kind:
    | "PRODUTO_NAO_ENCONTRADO_SB1"
    | "PRODUTO_SEM_SBZ_FILIAL"
    | "FORNECEDOR_NAO_ENCONTRADO_SA2"
    | "NF_SEM_DOCUMENTO_FORNECEDOR"
    | "CHAVE_DUPLICADA";
  source: string;
  sourceKey: string;
  detail: string;
};

export type AuditDuplicate = { scope: string; key: string; occurrences: number };

export type OperationalAuditReport = {
  generatedAt: string;
  readOnly: true;
  metrics: AuditSourceMetric[];
  exceptions: AuditException[];
  duplicates: AuditDuplicate[];
};

export type OperationalAuditInput = {
  sb1: Sb1Row[];
  sbz: SbzRow[];
  sb5?: Sb5Row[];
  sa2: Sa2Row[];
  orders?: PurchaseOrderSourceRow[];
  invoices?: NfLegalSourceRow[];
  stock?: StockEvolutionSourceRow[];
};

function emptyMetric(source: string): AuditSourceMetric {
  return { source, total: 0, direct: 0, aggregate: 0, notFound: 0, ambiguous: 0, matchRate: 1 };
}

function finishMetric(metric: AuditSourceMetric): AuditSourceMetric {
  const classified = metric.direct + metric.aggregate + metric.notFound;
  return { ...metric, matchRate: classified ? (metric.direct + metric.aggregate) / classified : 1 };
}

function countKeys<T>(rows: T[], keyOf: (row: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function duplicatesFrom(counts: Map<string, number>, scope: string): AuditDuplicate[] {
  return [...counts.entries()].filter(([, occurrences]) => occurrences > 1).map(([key, occurrences]) => ({ scope, key, occurrences }));
}

/** Índices somente leitura construídos a partir da SB1 (cadastro base). */
export type Sb1AuditIndex = {
  directCodes: Set<string>;
  aggregateCodes: Set<string>;
  duplicateCodes: AuditDuplicate[];
};

export function buildSb1AuditIndex(sb1: Sb1Row[]): Sb1AuditIndex {
  const directCodes = new Set<string>();
  const aggregateCodes = new Set<string>();
  for (const row of sb1) {
    const direct = normalizeProductCode(row.normalizedProductCode || row.productCode);
    if (direct) directCodes.add(direct);
    const aggregate = normalizeProductCode(row.normalizedAggregateProductCode || row.aggregateProductCode);
    if (aggregate) aggregateCodes.add(aggregate);
  }
  // Duplicidade é avaliada pelo código ORIGINAL (não normalizado), preservando
  // a distinção exata entre variantes como "100000044835" e "100000044835-MGT".
  const counts = countKeys(sb1, row => cleanSourceText(row.productCode));
  return { directCodes, aggregateCodes, duplicateCodes: duplicatesFrom(counts, "SB1.Codigo") };
}

export type AuditMatch = { kind: AuditMatchKind; matchedBy: "CODIGO" | "AGREGADO" | null };

/** Classifica um produto contra a SB1 sem join: apenas existência de chave. */
export function classifyProductInSb1(index: Sb1AuditIndex, productCode: unknown, aggregateProductCode?: unknown): AuditMatch {
  const direct = normalizeProductCode(productCode);
  if (direct && index.directCodes.has(direct)) return { kind: "DIRETO", matchedBy: "CODIGO" };
  const aggregate = normalizeProductCode(aggregateProductCode);
  if (aggregate && index.aggregateCodes.has(aggregate)) return { kind: "AGREGADO", matchedBy: "AGREGADO" };
  // Fallback: quando a origem traz só um campo de produto, ele pode conter o
  // agregado; tentar como agregado antes de declarar não encontrado.
  if (aggregateProductCode === undefined && direct && index.aggregateCodes.has(direct)) return { kind: "AGREGADO", matchedBy: "AGREGADO" };
  return { kind: "NAO_ENCONTRADO", matchedBy: null };
}

function applyMatch(metric: AuditSourceMetric, match: AuditMatch): void {
  metric.total += 1;
  if (match.kind === "DIRETO") metric.direct += 1;
  else if (match.kind === "AGREGADO") metric.aggregate += 1;
  else metric.notFound += 1;
}

/**
 * Relatório de auditoria somente leitura dos cruzamentos operacionais.
 * Não altera nenhum dado de entrada; usa apenas existência de chaves.
 */
export function buildOperationalAuditReport(input: OperationalAuditInput): OperationalAuditReport {
  const exceptions: AuditException[] = [];
  const duplicates: AuditDuplicate[] = [];
  const sb1Index = buildSb1AuditIndex(input.sb1);
  duplicates.push(...sb1Index.duplicateCodes);

  // SBZ: chave código+filial (ampliação do cadastro por filial).
  const sbzKeys = new Set(input.sbz.map(row => `${normalizeBranchCode(row.branchCode)}|${normalizeProductCode(row.productCode)}`));
  const sbzDuplicateKeys = duplicatesFrom(
    countKeys(input.sbz, row => `${normalizeBranchCode(row.branchCode)}|${normalizeProductCode(row.productCode)}`),
    "SBZ.Filial+Codigo",
  );
  duplicates.push(...sbzDuplicateKeys);

  const metrics: AuditSourceMetric[] = [];

  // SBZ → SB1: cada linha da SBZ deve existir na SB1 (código direto ou agregado).
  const sbzMetric = emptyMetric("SBZ→SB1");
  for (const row of input.sbz) {
    const match = classifyProductInSb1(sb1Index, row.productCode);
    applyMatch(sbzMetric, match);
    if (match.kind === "NAO_ENCONTRADO") {
      exceptions.push({ kind: "PRODUTO_NAO_ENCONTRADO_SB1", source: "SBZ", sourceKey: `${normalizeBranchCode(row.branchCode)}|${cleanSourceText(row.productCode)}`, detail: `Produto ${cleanSourceText(row.productCode)} da SBZ não encontrado na SB1 (direto ou agregado).` });
    }
  }
  metrics.push(finishMetric(sbzMetric));

  // SB5 → SB1 (quando fornecida).
  if (input.sb5) {
    const sb5Metric = emptyMetric("SB5→SB1");
    for (const row of input.sb5) {
      const match = classifyProductInSb1(sb1Index, row.productCode);
      applyMatch(sb5Metric, match);
      if (match.kind === "NAO_ENCONTRADO") {
        exceptions.push({ kind: "PRODUTO_NAO_ENCONTRADO_SB1", source: "SB5", sourceKey: cleanSourceText(row.productCode), detail: `Produto ${cleanSourceText(row.productCode)} da SB5 não encontrado na SB1 (direto ou agregado).` });
      }
    }
    metrics.push(finishMetric(sb5Metric));
  }

  // Pedidos → produto+filial: produto na SB1 e existência código+filial na SBZ.
  if (input.orders) {
    const ordersMetric = emptyMetric("Pedidos→SB1/SBZ");
    const orderKeyCounts = countKeys(input.orders, row => row.key);
    duplicates.push(...duplicatesFrom(orderKeyCounts, "Pedidos.Chave"));
    for (const row of input.orders) {
      const match = classifyProductInSb1(sb1Index, row.productCode);
      applyMatch(ordersMetric, match);
      const branch = normalizeBranchCode(row.branch);
      const product = normalizeProductCode(row.productCode);
      if (match.kind === "NAO_ENCONTRADO") {
        exceptions.push({ kind: "PRODUTO_NAO_ENCONTRADO_SB1", source: "PEDIDO_COMPRA", sourceKey: row.key, detail: `Produto ${product} do pedido não encontrado na SB1 (direto ou agregado).` });
      }
      if (!sbzKeys.has(`${branch}|${product}`)) {
        exceptions.push({ kind: "PRODUTO_SEM_SBZ_FILIAL", source: "PEDIDO_COMPRA", sourceKey: row.key, detail: `Produto ${product} sem ampliação SBZ na filial ${branch}.` });
      }
      if ((orderKeyCounts.get(row.key) ?? 0) > 1) {
        exceptions.push({ kind: "CHAVE_DUPLICADA", source: "PEDIDO_COMPRA", sourceKey: row.key, detail: `Chave de pedido ${row.key} aparece ${(orderKeyCounts.get(row.key) ?? 0)} vezes; conferir granularidade (Filial+Pedido+Item).` });
      }
    }
    metrics.push(finishMetric(ordersMetric));
  }

  // NF Legal → SA2 por documento (CNPJ/CPF). A fonte NF Legal atual é
  // documental e não possui produto/item; portanto, não inferir duplicidade
  // por linha de produto. Duplicidade de NF usa a chave documental original.
  if (input.invoices) {
    const invoicesMetric = emptyMetric("NF→SA2 por documento");
    const supplierDocuments = countKeys(input.sa2, row => cleanSourceText(row.document).replace(/\D/g, ""));
    duplicates.push(...duplicatesFrom(supplierDocuments, "SA2.Documento"));
    const invoiceDocumentKeys = countKeys(input.invoices, row => cleanSourceText(row.key));
    duplicates.push(...duplicatesFrom(invoiceDocumentKeys, "NF_LEGAL.Documento"));
    for (const row of input.invoices) {
      invoicesMetric.total += 1;
      const document = cleanSourceText(row.supplierDocument).replace(/\D/g, "");
      if (!document) {
        invoicesMetric.notFound += 1;
        exceptions.push({ kind: "NF_SEM_DOCUMENTO_FORNECEDOR", source: row.origin, sourceKey: row.key, detail: `NF ${cleanSourceText(row.invoiceNumber)} sem CNPJ/CPF utilizável para cruzar com a SA2.` });
      } else {
        const occurrences = supplierDocuments.get(document) ?? 0;
        if (occurrences === 0) {
          invoicesMetric.notFound += 1;
          exceptions.push({ kind: "FORNECEDOR_NAO_ENCONTRADO_SA2", source: row.origin, sourceKey: row.key, detail: `Fornecedor com documento ${document} não localizado na SA2.` });
        } else if (occurrences > 1) {
          invoicesMetric.ambiguous += 1;
          exceptions.push({ kind: "CHAVE_DUPLICADA", source: row.origin, sourceKey: row.key, detail: `Documento ${document} aparece ${occurrences} vezes na SA2; fornecedor ambíguo — não inferir fornecedor único.` });
        } else {
          invoicesMetric.direct += 1;
        }
      }
      if ((invoiceDocumentKeys.get(row.key) ?? 0) > 1) {
        exceptions.push({ kind: "CHAVE_DUPLICADA", source: row.origin, sourceKey: row.key, detail: `A chave documental ${row.key} aparece ${invoiceDocumentKeys.get(row.key)} vezes na NF Legal. A fonte não possui produto/item; a chave representa a NF, não uma linha de produto. Confirmar se a repetição é duplicidade da extração.` });
      }
    }
    metrics.push(finishMetric(invoicesMetric));
  }

  // Estoque → produto/agregado+filial (quando o agregado está disponível).
  if (input.stock) {
    const stockMetric = emptyMetric("Estoque→SB1");
    for (const row of input.stock) {
      const match = classifyProductInSb1(sb1Index, row.productCode, row.aggregateProductCode);
      applyMatch(stockMetric, match);
      if (match.kind === "NAO_ENCONTRADO") {
        exceptions.push({ kind: "PRODUTO_NAO_ENCONTRADO_SB1", source: "ESTOQUE", sourceKey: `${normalizeBranchCode(row.branch)}|${normalizeProductCode(row.productCode)}`, detail: `Produto ${normalizeProductCode(row.productCode)} (agregado ${normalizeProductCode(row.aggregateProductCode) || "vazio"}) do estoque não encontrado na SB1.` });
      }
    }
    metrics.push(finishMetric(stockMetric));
  }

  return { generatedAt: new Date().toISOString(), readOnly: true, metrics, exceptions, duplicates };
}
