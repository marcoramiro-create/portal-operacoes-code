import { describe, expect, it } from "vitest";
import { normalizeNfAccessKey, parseNfAccessKey } from "./nfReceipts";

describe("chave de acesso de NF", () => {
  const accessKey = "35240812345678000199550010000001234567890123";

  it("normaliza e separa os campos da chave de 44 dígitos", () => {
    const parsed = parseNfAccessKey("35 2408 12345678000199 55 001 000000123 4 56789012 3");
    expect(parsed).toMatchObject({ accessKey, issuedYearMonth: "2408", issuerCnpj: "12345678000199", invoiceModel: "55", invoiceSeries: "001", invoiceNumber: "000000123" });
    expect(normalizeNfAccessKey("35.2408-12345678000199")).toBe("35240812345678000199");
  });

  it("rejeita chave sem os 44 dígitos obrigatórios", () => {
    expect(() => parseNfAccessKey("12345")).toThrow("44 dígitos");
  });
});
