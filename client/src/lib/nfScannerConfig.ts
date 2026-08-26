import { BarcodeFormat, DecodeHintType } from "@zxing/library";

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

export function normalizeNfScannerValue(value: string) {
  const accessKey = value.replace(/\D/g, "").slice(0, 44);
  return accessKey.length === 44 ? accessKey : null;
}
