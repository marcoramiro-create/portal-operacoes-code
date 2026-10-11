import { describe, expect, it } from "vitest";
import { isValidCpf, isValidCnpj, normalizeDocument, validateCardNumber, validatePersonDocument } from "./personDocumentValidation";

describe("personDocumentValidation", () => {
  it("normaliza documentos brasileiros formatados", () => {
    expect(normalizeDocument("529.982.247-25")).toBe("52998224725");
    expect(normalizeDocument("04.252.011/0001-10")).toBe("04252011000110");
  });

  it("valida CPF e rejeita sequências inválidas", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(validatePersonDocument("PF", "529.982.247-25").normalized).toBe("52998224725");
  });

  it("valida CNPJ numérico", () => {
    expect(isValidCnpj("04.252.011/0001-10")).toBe(true);
    expect(isValidCnpj("04.252.011/0001-11")).toBe(false);
  });

  it("valida a estrutura do CNPJ alfanumérico com os mesmos dígitos verificadores", () => {
    // Exemplo sintético válido pelo algoritmo oficial: as 12 primeiras posições aceitam letras.
    expect(isValidCnpj("ABCD1234EFGH46")).toBe(true);
    expect(validatePersonDocument("PJ", "ABCD1234EFGH46").valid).toBe(true);
  });

  it("aceita cartão vazio, mas limita o formato do cartão informado", () => {
    expect(validateCardNumber(undefined)).toBe(true);
    expect(validateCardNumber("CR-12345")).toBe(true);
    expect(validateCardNumber("***")).toBe(false);
  });
});
