import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { nfScannerFastDelayMs } from "./nfScannerConfig";
/*
 * Leitor da DANFE (chave de 44 dígitos) — ADAPTATIVO POR SO (27/09/2026).
 * Confirmado na prática:
 * - ANDROID: a leitura por FOTO funciona (câmera nativa + decode da imagem).
 * - iOS: a leitura AO VIVO funciona (ZXing decodeFromVideoElement).
 * SOLUÇÃO: detecta o SO e usa o fluxo certo em cada um.
 * - Android -> decodeFromFile (foto)
 * - iOS/outros -> start (leitura ao vivo com ZXing)
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

/** Detecta o sistema operacional do aparelho. */
export function detectPlatform(): "android" | "ios" | "other" {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/android/i.test(ua)) return "android";
  if (/iPad|iPhone|iPod/i.test(ua)) return "ios";
  return "other";
}

export class NfBarcodeScanner {
  private target: HTMLElement | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private reader: BrowserMultiFormatReader | null = null;
  private controls: { stop: () => void } | null = null;
  private active = false;
  private onDetected: ((key: string) => void) | null = null;

  /** FLUXO iOS/outros: leitura AO VIVO (ZXing direto no vídeo). */
  async start(target: HTMLElement, onDetected: (key: string) => void): Promise<void> {
    this.stop();
    this.target = target;
    this.onDetected = onDetected;
    this.active = true;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera-unavailable");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.stream = stream;
    const track = stream.getVideoTracks()[0];
    this.videoTrack = track ?? null;
    if (track && typeof track.applyConstraints === "function") {
      try {
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] } as MediaTrackConstraints);
      } catch { /* sem suporte */ }
    }
    target.innerHTML = "";
    const video = document.createElement("video");
    video.setAttribute("playsinline", "");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "cover";
    video.srcObject = stream;
    target.appendChild(video);
    this.video = video;
    try { await video.play(); } catch { /* segue */ }
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, nfBarcodeFormats);
    this.reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: nfScannerFastDelayMs });
    const controls = await this.reader.decodeFromVideoElement(video, result => {
      if (!this.active || !result) return;
      const key = normalizeNfBarcodeValue(result.getText());
      if (key) this.onDetected?.(key);
    });
    if (!this.active) { controls.stop(); return; }
    this.controls = controls;
  }

  /** FLUXO Android: leitura por FOTO (câmera nativa + decode da imagem). */
  async decodeFromFile(file: File): Promise<string | null> {
    let url: string | null = null;
    try {
      url = URL.createObjectURL(file);
      const img = await this.loadImage(url);
      const canvas = this.drawResized(img, 1280);
      if (!canvas) return null;
      const nativeKey = await this.tryNativeDetect(canvas);
      if (nativeKey) return nativeKey;
      return await this.tryZxingCanvas(canvas);
    } catch {
      return null;
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image-load-failed"));
      img.src = src;
    });
  }

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

  private async tryNativeDetect(canvas: HTMLCanvasElement): Promise<string | null> {
    const w = window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (s: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } };
    const BD = w.BarcodeDetector;
    if (!BD) return null;
    try {
      const detector = new BD({ formats: ["code_128"] });
      const codes = await detector.detect(canvas);
      for (const code of codes) {
        const key = normalizeNfBarcodeValue(code.rawValue);
        if (key) return key;
      }
    } catch { /* tenta sem formatos */ }
    try {
      const detector = new BD();
      const codes = await detector.detect(canvas);
      for (const code of codes) {
        const key = normalizeNfBarcodeValue(code.rawValue);
        if (key) return key;
      }
    } catch { /* segue */ }
    return null;
  }

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

  stop(): void {
    this.active = false;
    if (this.video) { this.video.srcObject = null; this.video.remove(); this.video = null; }
    try { this.controls?.stop(); } catch { /* já encerrado */ }
    this.controls = null;
    this.reader = null;
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    this.videoTrack = null;
    if (this.target) { this.target.innerHTML = ""; this.target = null; }
    this.onDetected = null;
  }
}