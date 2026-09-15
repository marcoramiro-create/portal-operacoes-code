import { describe, expect, it } from "vitest";
import { classifyOperation, cleanSourceText, normalizeInvoiceKey, normalizeProductCode, normalizePurchaseOrderKey, normalizeSupplierKey, parseSourceNumber } from "./operationalNormalization";

describe("operationalNormalization", () => {
  it("limpa espaços excedentes sem alterar o conteúdo textual", () => {
    expect(cleanSourceText("  Produto     com espaços   ")).toBe("Produto com espaços");
  });
  it("normaliza produto numérico preservando sufixos", () => {
    expect(normalizeProductCode("00000136-MGT")).toBe("00000136-MGT");
    expect(normalizeProductCode("032100034A")).toBe("032100034A");
    expect(normalizeProductCode("VEIC_034917")).toBe("VEIC_034917");
  });
  it("mantém números como números", () => {
    expect(parseSourceNumber("1.234,56")).toBe(1234.56);
    expect(parseSourceNumber("100")).toBe(100);
    expect(parseSourceNumber("x")).toBeNull();
  });
  it("não trata pedido como único sem filial e item", () => {
    expect(normalizePurchaseOrderKey("0101", "045209", "0001")).toBe("0101|045209|0001");
    expect(normalizePurchaseOrderKey("0301", "045209", "0001")).not.toBe("0101|045209|0001");
  });
  it("usa a chave de acesso como chave fiscal principal", () => {
    expect(normalizeInvoiceKey("0101", "123", "1", "008925", "35260100000000000000550010000001231234567890")).toBe("35260100000000000000550010000001231234567890");
  });
  it("usa fornecedor e loja como chave", () => {
    expect(normalizeSupplierKey("000001", "01")).toBe("000001|01");
  });
  it("classifica operações por departamento do armazém", () => {
    expect(classifyOperation({ branch: "0101", department: "PEÇAS" })).toBe("AUTOPECAS");
    expect(classifyOperation({ branch: "0101", department: "OFICINAS" })).toBe("SERVICOS");
    expect(classifyOperation({ branch: "0105", department: "IMPLEMENTOS" })).toBe("INDUSTRIA");
    expect(classifyOperation({ branch: "0301", department: "IMPLEMENTOS" })).toBe("IMPLEMENTOS");
  });
});
