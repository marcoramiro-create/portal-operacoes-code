import { BarcodeFormat, DecodeHintType } from "@zxing/library";
// ============================================================
// Configuração do leitor de NF (DANFE — chave de acesso de 44 dígitos).
// 25/09/2026 (BLOCO 3 — ACELERAÇÃO): os valores "rápidos" (Fast) foram
// adicionados para o nfBarcodeScanner.ts usá-los. Os valores antigos
// foram MANTIDOS para não quebrar os testes existentes.
// ============================================================
export const nfScannerFormats = [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE];
export const nfScannerHints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, nfScannerFormats],
  [DecodeHintType.TRY_HARDER, true],
]);
export const nfScannerOptions = {
  delayBetweenScanAttempts: 90,
  delayBetweenScanSuccess: 250,
  tryPlayVideoTimeout: 8_000,
};
export const nfCameraConstraints: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1_920 },
  height: { ideal: 1_080 },
  frameRate: { ideal: 30, min: 15 },
};
// ----- BLOCO 3 — valores rápidos (usados pelo nfBarcodeScanner.ts) -----
// Resolução menor = muito menos trabalho por tentativa de leitura, sem perder
// nitidez suficiente para o código de barras. 1280x720 é o equilíbrio entre
// velocidade e precisão para códigos longos (44 dígitos).
export const nfScannerFastConstraints: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1_280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, min: 15 },
};
// Intervalo entre tentativas de leitura do leitor compatível (iPhone/Safari).
// 90ms é rápido o bastante para responder sem travar o aparelho.
export const nfScannerFastDelayMs = 90;
export function normalizeNfScannerValue(value: string) {
  const accessKey = value.replace(/\D/g, "").slice(0, 44);
  return accessKey.length === 44 ? accessKey : null;
}