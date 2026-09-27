import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
/*
 * Leitor da DANFE (chave de 44 dígitos) — LEITURA POR FOTO.
 * O usuário fotografa o código com a CÂMERA NATIVA (via <input capture>) e a
 * aplicação lê a foto com o ZXing. Funciona em Android e iOS, sem depender do
 * leitor nativo do navegador (que falha no Android) e sem processar vídeo ao vivo.
 * REGRA: só vale chave com 44 dígitos E dígito verificador correto.
 */
export const nfBarcodeFormats = [BarcodeFormat.CODE_128, BarcodeFormat.ITF, BarcodeFormat.CODE_39];

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

export function normalizeNfBarcodeValue(value: string | null | undefined) {
  const accessKey = (value ?? "").replace(/\D/g, "").slice(0, 44);
  return accessKey.length === 44 && isValidNfAccessKey(accessKey) ? accessKey : null;
}

export class NfBarcodeScanner {
  /** Lê a chave de acesso a partir de uma FOTO (arquivo de imagem). Retorna a chave ou null. */
  async decodeFromFile(file: File): Promise<string | null> {
    try {
      const dataUrl = await this.readFileAsDataUrl(file);
      const img = await this.loadImage(dataUrl);
      const hints = new Map<DecodeHintType, unknown>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, nfBarcodeFormats);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 300 });
      const result = await reader.decodeFromImageElement(img);
      return normalizeNfBarcodeValue(result.getText());
    } catch {
      return null;
    }
  }
  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image-load-failed"));
      img.src = src;
    });
  }
}