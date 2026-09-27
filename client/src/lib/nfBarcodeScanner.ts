import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
/*
 * Leitor da DANFE (chave de 44 dígitos) — LEITURA POR FOTO (CORRIGIDO).
 * O usuário fotografa o código com a CÂMERA NATIVA (via <input capture>) e a
 * aplicação lê a foto. CORREÇÃO (27/09/2026): a versão anterior decodificava a
 * foto GIGANTE do celular (4000x3000) direto no ZXing — inconsistente e falha.
 * Agora: 1) reduz a foto para no máximo 1280px; 2) tenta o leitor NATIVO do
 * Android na imagem estática (onde ele é excelente); 3) se falhar, tenta o ZXing
 * no canvas reduzido com máximo esforço (cobre iOS e fallback).
 * REGRA: só vale chave com 44 dígitos E dígito verificador correto.
 */
export const nfBarcodeFormats = [BarcodeFormat.CODE_128, BarcodeFormat.ITF, BarcodeFormat.CODE_39];

/** Valida o dígito verificador (DV) da chave de acesso da NF-e (módulo 11). */
export function isValidNfAccessKey(accessKey: string) {
  if (!/^\d{44}$/.test(accessKey)) return false;
  let sum = 0;
  let weight = 2;
  for (let i = 42; i >= 0; i--) {
    sum += Number(accessKey[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  const dv = rest === 0 || rest === 1 ? 0 : 11 - rest;
  return dv === Number(accessKey[43]);
}

/** Deixa apenas os dígitos e garante a chave de 44 posições com DV válido. Retorna null se inválida. */
export function normalizeNfBarcodeValue(value: string | null | undefined) {
  const accessKey = (value ?? "").replace(/\D/g, "").slice(0, 44);
  return accessKey.length === 44 && isValidNfAccessKey(accessKey) ? accessKey : null;
}

type NativeDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

export class NfBarcodeScanner {
  /** Lê a chave de acesso a partir de uma FOTO (arquivo de imagem). Retorna a chave ou null. */
  async decodeFromFile(file: File): Promise<string | null> {
    let url: string | null = null;
    try {
      url = URL.createObjectURL(file);
      const img = await this.loadImage(url);
      const canvas = this.drawResized(img, 1280);
      if (!canvas) return null;
      // 1) Leitor NATIVO na imagem estática (excelente no Android).
      const nativeKey = await this.tryNativeDetect(canvas);
      if (nativeKey) return nativeKey;
      // 2) ZXing no canvas reduzido com máximo esforço (iOS e fallback).
      return await this.tryZxingCanvas(canvas);
    } catch {
      return null;
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  /** Carrega uma imagem a partir de um object URL. */
  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image-load-failed"));
      img.src = src;
    });
  }

  /** Desenha a imagem num canvas com no máximo `maxWidth` de largura (mantém proporção). */
  private drawResized(img: HTMLImageElement, maxWidth: number): HTMLCanvasElement | null {
    let width = img.naturalWidth || img.width || 1280;
    let height = img.naturalHeight || img.height || 720;
    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  }

  /** Tenta o leitor nativo (BarcodeDetector) na imagem estática. */
  private async tryNativeDetect(canvas: HTMLCanvasElement): Promise<string | null> {
    const w = window as unknown as {
      BarcodeDetector?: new (options?: { formats?: string[] }) => NativeDetector;
    };
    const BD = w.BarcodeDetector;
    if (!BD) return null;
    try {
      const detector = new BD({ formats: ["code_128"] });
      const codes = await detector.detect(canvas);
      for (const code of codes) {
        const key = normalizeNfBarcodeValue(code.rawValue);
        if (key) return key;
      }
    } catch {
      /* tenta sem formatos abaixo */
    }
    try {
      const detector = new BD();
      const codes = await detector.detect(canvas);
      for (const code of codes) {
        const key = normalizeNfBarcodeValue(code.rawValue);
        if (key) return key;
      }
    } catch {
      /* sem suporte — segue para o ZXing */
    }
    return null;
  }

  /** Tenta o ZXing no canvas reduzido com máximo esforço. */
  private async tryZxingCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, nfBarcodeFormats);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 300 });
    try {
      const result = await reader.decodeFromCanvas(canvas);
      return normalizeNfBarcodeValue(result?.getText());
    } catch {
      return null;
    }
  }
}