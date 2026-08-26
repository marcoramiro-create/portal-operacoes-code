import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { describe, expect, it } from "vitest";
import { nfCameraConstraints, nfScannerFormats, nfScannerHints, nfScannerOptions, normalizeNfScannerValue } from "../client/src/lib/nfScannerConfig";

describe("configuração do leitor de NF", () => {
  it("prioriza Code 128 e QR Code com tentativa reforçada", () => {
    expect(nfScannerFormats).toEqual([BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE]);
    expect(nfScannerHints.get(DecodeHintType.POSSIBLE_FORMATS)).toEqual(nfScannerFormats);
    expect(nfScannerHints.get(DecodeHintType.TRY_HARDER)).toBe(true);
    expect(nfScannerOptions.delayBetweenScanAttempts).toBeLessThan(500);
  });

  it("aceita somente uma chave de acesso normalizada com 44 dígitos", () => {
    expect(normalizeNfScannerValue("1234.5678 9012-3456 7890 1234 5678 9012 3456 7890 1234")).toBe("12345678901234567890123456789012345678901234");
    expect(normalizeNfScannerValue("12345")).toBeNull();
  });

  it("prefere câmera traseira com resolução adequada para códigos lineares", () => {
    expect(nfCameraConstraints.facingMode).toEqual({ ideal: "environment" });
    expect(nfCameraConstraints.width).toEqual({ ideal: 1920 });
    expect(nfCameraConstraints.height).toEqual({ ideal: 1080 });
  });
});
