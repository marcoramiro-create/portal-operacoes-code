import { describe, expect, it } from "vitest";
import { buildOperationalAuditReport, buildSb1AuditIndex, classifyProductInSb1 } from "./operationalAuditService";
import type { Sb1Row, SbzRow, Sb5Row, Sa2Row } from "./protheusCatalogParsers";
import type { PurchaseOrderSourceRow, NfLegalSourceRow, StockEvolutionSourceRow } from "./operationalSourceParsers";

const sb1Row = (productCode: string, aggregateProductCode: string): Sb1Row => ({
  productCode,
  normalizedProductCode: productCode,
  aggregateProductCode,
  normalizedAggregateProductCode: aggregateProductCode,
  description: "",
  type: "ME",
  family: "",
  subfamily: "",
  ncm: "",
  inclusionDate: "",
});

const sbzRow = (branchCode: string, productCode: string): SbzRow => ({
  branchCode,
  productCode,
  taxGroup: "",
  type: "",
  minStock: "0",
  maxStock: "0",
  origin: "",
  mrp: false,
  fiscalClass: "",
});

const sa2Row = (document: string): Sa2Row => ({
  supplierCode: "000001",
  store: "01",
  document,
  legalName: "Fornecedor",
  tradeAddress: "",
  number: "",
  zipCode: "",
  neighborhood: "",
  municipality: "",
  state: "",
});

const orderRow = (partial: Partial<PurchaseOrderSourceRow>): PurchaseOrderSourceRow => ({
  branch: "0101",
  orderNumber: "1",
  orderItem: "01",
  productCode: "100000044835",
  quantity: 1,
  expectedDate: null,
  deliveredDate: null,
  totalValue: 10,
  orderDate: null,
  deliveredQuantity: null,
  supplierCode: "000001",
  supplierStore: "01",
  warehouse: "01",
  buyer: "",
  preNote: "",
  preNoteQuantity: null,
  key: "0101|1|01",
  ...partial,
});

const invoiceRow = (partial: Partial<NfLegalSourceRow>): NfLegalSourceRow => ({
  origin: "NF_LEGAL",
  branch: "0101",
  invoiceNumber: "10",
  series: "1",
  supplierDocument: "59918136000128",
  supplierName: "",
  issuedAt: null,
  preNoteAt: null,
  classifiedAt: null,
  accessKey: "",
  status: "",
  totalXml: null,
  totalErp: null,
  key: "nf-1",
  ...partial,
});

const stockRow = (partial: Partial<StockEvolutionSourceRow>): StockEvolutionSourceRow => ({
  company: "0101",
  branch: "0101",
  productCode: "100000044835",
  aggregateProductCode: "",
  description: "",
  unit: "UN",
  year: 2026,
  month: 8,
  quantity: 1,
  totalValue: 10,
  ...partial,
});

describe("operationalAuditService", () => {
  it("não altera os dados de entrada (somente leitura)", () => {
    const sb1 = [sb1Row("100000044835", "100000044835-MGT")];
    const sbz = [sbzRow("0101", "100000044835")];
    const snapshot = JSON.stringify({ sb1, sbz });
    buildOperationalAuditReport({ sb1, sbz, sa2: [] });
    expect(JSON.stringify({ sb1, sbz })).toBe(snapshot);
  });

  it("preserva zeros à esquerda do código do produto", () => {
    const index = buildSb1AuditIndex([sb1Row("000000000123", "000000000123-AG")]);
    expect(classifyProductInSb1(index, "000000000123").kind).toBe("DIRETO");
    expect(classifyProductInSb1(index, "123").kind).toBe("NAO_ENCONTRADO");
    expect(classifyProductInSb1(index, "000000000123-AG").kind).toBe("AGREGADO");
    expect(classifyProductInSb1(index, "123-AG").kind).toBe("NAO_ENCONTRADO");
  });

  it("classifica direto, agregado e não encontrado separadamente", () => {
    const sb1 = [sb1Row("100000044835", "100000044835-MGT"), sb1Row("100000044835-MGT", "100000044835-MGT")];
    const report = buildOperationalAuditReport({
      sb1,
      sbz: [],
      sa2: [],
      stock: [stockRow({}), stockRow({ productCode: "OUTRO", aggregateProductCode: "100000044835-MGT" }), stockRow({ productCode: "FALTANDO", aggregateProductCode: "" })],
    });
    const metric = report.metrics.find(m => m.source === "Estoque→SB1");
    expect(metric?.direct).toBe(1);
    expect(metric?.aggregate).toBe(1);
    expect(metric?.notFound).toBe(1);
    expect(report.exceptions.filter(e => e.kind === "PRODUTO_NAO_ENCONTRADO_SB1")).toHaveLength(1);
  });

  it("cruza pedido por produto+filial na SBZ sem multiplicar linhas", () => {
    const sb1 = [sb1Row("100000044835", "100000044835-MGT")];
    const sbz = [sbzRow("0101", "100000044835")];
    const orders = [orderRow({}), orderRow({ key: "0101|1|02", orderItem: "02" })];
    const report = buildOperationalAuditReport({ sb1, sbz, sa2: [], orders });
    const metric = report.metrics.find(m => m.source === "Pedidos→SB1/SBZ");
    expect(metric?.total).toBe(2);
    expect(metric?.direct).toBe(2);
    expect(report.exceptions).toHaveLength(0);
  });

  it("aponta pedido com produto sem SBZ na filial", () => {
    const sb1 = [sb1Row("100000044835", "100000044835-MGT")];
    const orders = [orderRow({ branch: "0301", key: "0301|1|01" })];
    const report = buildOperationalAuditReport({ sb1, sbz: [sbzRow("0101", "100000044835")], sa2: [], orders });
    expect(report.exceptions.some(e => e.kind === "PRODUTO_SEM_SBZ_FILIAL" && e.detail.includes("0301"))).toBe(true);
  });

  it("cruza NF com SA2 por documento e marca documento duplicado como ambíguo", () => {
    const sa2 = [sa2Row("59.918.136/0001-28")];
    const invoices = [invoiceRow({}), invoiceRow({ key: "nf-2", supplierDocument: "59918136000128" })];
    const report = buildOperationalAuditReport({ sb1: [], sbz: [], sa2, invoices });
    const metric = report.metrics.find(m => m.source === "NF→SA2 por documento");
    expect(metric?.direct).toBe(2);
    expect(report.exceptions).toHaveLength(0);
  });

  it("marca NF com fornecedor ausente e NF sem documento", () => {
    const invoices = [invoiceRow({ key: "nf-a", supplierDocument: "11111111111111" }), invoiceRow({ key: "nf-b", supplierDocument: "" })];
    const report = buildOperationalAuditReport({ sb1: [], sbz: [], sa2: [sa2Row("59918136000128")], invoices });
    const metric = report.metrics.find(m => m.source === "NF→SA2 por documento");
    expect(metric?.notFound).toBe(2);
    expect(report.exceptions.some(e => e.kind === "FORNECEDOR_NAO_ENCONTRADO_SA2")).toBe(true);
    expect(report.exceptions.some(e => e.kind === "NF_SEM_DOCUMENTO_FORNECEDOR")).toBe(true);
  });

  it("reporta duplicidades de SB1, SBZ e chaves de pedido", () => {
    const sb1 = [sb1Row("100000044835", "A"), sb1Row("100000044835", "A")];
    const sbz = [sbzRow("0101", "100000044835"), sbzRow("0101", "100000044835")];
    const orders = [orderRow({}), orderRow({})];
    const report = buildOperationalAuditReport({ sb1, sbz, sa2: [], orders });
    expect(report.duplicates.some(d => d.scope === "SB1.Codigo")).toBe(true);
    expect(report.duplicates.some(d => d.scope === "SBZ.Filial+Codigo")).toBe(true);
    expect(report.duplicates.some(d => d.scope === "Pedidos.Chave")).toBe(true);
    expect(report.exceptions.filter(e => e.kind === "CHAVE_DUPLICADA" && e.source === "PEDIDO_COMPRA")).toHaveLength(2);
  });

  it("usa existência de chaves: métricas não dependem de junção linha a linha", () => {
    const sb1 = [sb1Row("100000044835", "AG")];
    const sbz = [sbzRow("0101", "100000044835"), sbzRow("0101", "100000044835"), sbzRow("0101", "100000044835")];
    const report = buildOperationalAuditReport({ sb1, sbz, sa2: [] });
    const metric = report.metrics.find(m => m.source === "SBZ→SB1");
    expect(metric?.total).toBe(3);
    expect(metric?.direct).toBe(3);
  });

  it("cruza SB5 com SB1 quando fornecida", () => {
    const sb5: Sb5Row[] = [{ productCode: "100000044835", technicalFamily: "", partFamily: "", partBrand: "", partLine: "" }];
    const report = buildOperationalAuditReport({ sb1: [sb1Row("100000044835", "AG")], sbz: [], sb5, sa2: [] });
    expect(report.metrics.find(m => m.source === "SB5→SB1")?.direct).toBe(1);
  });

  it("normaliza filial da SBZ para 4 dígitos preservando zeros", () => {
    const sb1 = [sb1Row("100000044835", "AG")];
    const orders = [orderRow({ branch: "0101 - MEGATEC ARACATUBA", key: "0101|1|01" })];
    const report = buildOperationalAuditReport({ sb1, sbz: [sbzRow("101", "100000044835")], sa2: [], orders });
    expect(report.exceptions).toHaveLength(0);
  });
});
