import { describe, expect, it } from "vitest";
import { createNfBarcodeScannerConfig, nfBarcodeReaders, normalizeNfBarcodeValue } from "../client/src/lib/nfBarcodeScanner";

describe("leitor Code 128 de NF", () => {
  it("configura o leitor contínuo exclusivamente para Code 128", () => {
    const target = {} as Element;
    const config = createNfBarcodeScannerConfig(target);
    expect(nfBarcodeReaders).toEqual(["code_128_reader"]);
    expect(config.decoder?.readers).toEqual(["code_128_reader"]);
    expect(config.inputStream?.constraints?.facingMode).toEqual({ ideal: "environment" });
    expect(config.locator?.halfSample).toBe(false);
  });

  it("aceita apenas o resultado com 44 dígitos da chave de acesso", () => {
    expect(normalizeNfBarcodeValue("1234 5678 9012 3456 7890 1234 5678 9012 3456 7890 1234")).toBe("12345678901234567890123456789012345678901234");
    expect(normalizeNfBarcodeValue("Code128 sem chave completa")).toBeNull();
  });
});
