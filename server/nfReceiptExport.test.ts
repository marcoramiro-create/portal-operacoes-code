import { describe, expect, it } from "vitest";
import { formatNfReceiptExportRows } from "../shared/nfReceiptExport";

describe("exportação de recebimentos de NF", () => {
  it("preserva a chave como texto e inclui os dados de auditoria", () => {
    const rows = formatNfReceiptExportRows([{
      accessKey: "35240812345678000199550010000001234567890123",
      issuerCnpj: "12345678000199",
      invoiceModel: "55",
      invoiceSeries: "001",
      invoiceNumber: "000000123",
      issuedYearMonth: "2408",
      captureMethod: "manual",
      capturedAt: new Date("2026-08-26T15:30:00.000Z"),
      capturedBy: "Usuário de homologação",
      protheusSc7Reference: null,
      nfLegalReference: null,
      matchedAt: null,
      supplier: { code: "000123", store: "01", legalName: "Fornecedor Teste Ltda.", tradeName: "Fornecedor Teste" },
    }]);
    expect(rows[0]).toMatchObject({
      "Chave de acesso": "35240812345678000199550010000001234567890123",
      "Número NF": "000000123",
      "Modo de coleta": "Digitação",
      "Usuário da leitura": "Usuário de homologação",
      "Referência SC7 Protheus": "",
      "Fornecedor": "Fornecedor Teste",
      "Código fornecedor": "000123",
      "Loja fornecedor": "01",
    });
  });
});
