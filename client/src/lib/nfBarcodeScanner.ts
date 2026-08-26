import type { QuaggaJSConfigObject } from "@ericblade/quagga2";

export const nfBarcodeReaders = ["code_128_reader"] as const;

export function createNfBarcodeScannerConfig(target: Element): QuaggaJSConfigObject {
  return {
    inputStream: {
      type: "LiveStream",
      target,
      willReadFrequently: true,
      constraints: {
        facingMode: { ideal: "environment" },
        width: { min: 640, ideal: 1920 },
        height: { min: 480, ideal: 1080 },
        frameRate: { ideal: 30, min: 15 },
      },
      area: {
        top: "28%",
        right: "6%",
        bottom: "28%",
        left: "6%",
        borderColor: "rgba(255,255,255,0.95)",
        borderWidth: 2,
      },
    },
    locate: true,
    numOfWorkers: 0,
    frequency: 20,
    locator: {
      halfSample: false,
      patchSize: "medium",
      willReadFrequently: true,
    },
    decoder: {
      readers: [...nfBarcodeReaders],
    },
  };
}

export function normalizeNfBarcodeValue(value: string | null | undefined) {
  const accessKey = (value ?? "").replace(/\D/g, "").slice(0, 44);
  return accessKey.length === 44 ? accessKey : null;
}
