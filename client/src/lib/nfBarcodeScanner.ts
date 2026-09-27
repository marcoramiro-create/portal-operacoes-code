import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { nfScannerFastDelayMs } from "./nfScannerConfig";
/*
 * Leitor da DANFE (chave de acesso de 44 dígitos).
 * HISTÓRICO (para nunca se perder):
 * - 21/09/2026: Quagga2 (JS puro) — Android abria a câmera mas nunca lia.
 * - 22/09/2026 (manhã): BarcodeDetector nativo + fallback Quagga — seguiu sem ler.
 * - 22/09/2026 (tarde): ZXing — câmera abre, mas ainda não leu no aparelho.
 * - 22/09/2026 (V4): motor nativo quando existir + ZXing como contínuo quando não;
 *   botão "Fotografar e ler"; lanterna e zoom; indicador de modo.
 * - 25/09/2026 (BLOCO 3): câmera em 1280x720; foco contínuo; 90ms.
 * - 25/09/2026 (BLOCO 4): validação do dígito verificador (módulo 11).
 * - 27/09/2026 (BLOCO 5): detecta o SO e adapta a câmera.
 * - 27/09/2026 (BLOCO 6 — REVERTIDO): leitura por foto automática e contínua com
 *   máximo esforço TRAVOU o celular. Revertido para leitura contínua leve.
 * - 27/09/2026 (HÍBRIDO — REVERTIDO): loop manual criando um leitor ZXing novo a
 *   cada quadro regrediu o iOS e não resolveu o Android. REVERTIDO para o caminho
 *   que PROVOU funcionar: ZXing lendo direto do vídeo (decodeFromVideoElement),
 *   usado nos DOIS sistemas (o leitor nativo do Android falha em código longo).
 * - 27/09/2026 (CORREÇÃO FINAL — validada no código real): volta ao decodeFromVideoElement,
 *   emite apenas "native" | "zxing" (compatível com NfReceipts.tsx, que não muda).
 * REGRAS:
 * - Só vale chave com 44 dígitos E dígito verificador correto.
 * - Leitura contínua em modo filmagem é o comportamento normal de leitor.
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
export class NfBarcodeScanner {
  private target: HTMLElement | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private reader: BrowserMultiFormatReader | null = null;
  private controls: { stop: () => void } | null = null;
  private active = false;
  private onDetected: ((key: string) => void) | null = null;
  private onModeChange: ((mode: "native" | "zxing") => void) | null = null;
  async start(
    target: HTMLElement,
    onDetected: (key: string) => void,
    onModeChange?: (mode: "native" | "zxing") => void,
  ): Promise<void> {
    this.stop();
    this.target = target;
    this.onDetected = onDetected;
    this.onModeChange = onModeChange ?? null;
    this.active = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("camera-unavailable");
    }
    // Câmera em 1280x720 (a receita que provou ser rápida no iOS).
    const videoConstraints: MediaTrackConstraints = {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    };
    const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
    this.stream = stream;
    const track = stream.getVideoTracks()[0];
    this.videoTrack = track ?? null;
    // Foco contínuo (melhora muito a leitura no celular).
    if (track && typeof track.applyConstraints === "function") {
      try {
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] } as MediaTrackConstraints);
      } catch {
        /* aparelho sem suporte — segue sem foco contínuo */
      }
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
    try {
      await video.play();
    } catch {
      /* segue; o loop espera o readyState */
    }
    // Caminho que PROVOU funcionar: ZXing lendo direto do vídeo, nos dois sistemas.
    // O leitor nativo do Android falha em código longo de 44 dígitos, então usamos
    // o ZXing (que é o que lê de verdade) em Android e iOS.
    this.onModeChange?.("zxing");
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, nfBarcodeFormats);
    this.reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: nfScannerFastDelayMs });
    const controls = await this.reader.decodeFromVideoElement(video, result => {
      if (!this.active || !result) return;
      const key = normalizeNfBarcodeValue(result.getText());
      if (key) this.onDetected?.(key);
    });
    if (!this.active) {
      controls.stop();
      return;
    }
    this.controls = controls;
  }
  /** Congela um quadro e tenta ler nele — usado APENAS no botão "Fotografar e ler". */
  async captureStill(): Promise<boolean> {
    const { video } = this;
    if (!this.active || !video || video.readyState < 2) return false;
    let width = video.videoWidth || 1280;
    let height = video.videoHeight || 720;
    const MAX_WIDTH = 1280;
    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(video, 0, 0, width, height);
    // Na foto (sob demanda), vale usar o máximo esforço — é um único quadro, não trava.
    const stillHints = new Map<DecodeHintType, unknown>();
    stillHints.set(DecodeHintType.POSSIBLE_FORMATS, nfBarcodeFormats);
    stillHints.set(DecodeHintType.TRY_HARDER, true);
    const stillReader = new BrowserMultiFormatReader(stillHints, { delayBetweenScanAttempts: nfScannerFastDelayMs });
    try {
      const result = await stillReader.decodeFromCanvas(canvas);
      if (result) {
        const key = normalizeNfBarcodeValue(result.getText());
        if (key) {
          this.onDetected?.(key);
          return true;
        }
      }
    } catch {
      /* nada lido */
    }
    return false;
  }
  /** Liga/desliga a lanterna quando o aparelho suporta. Retorna false se não suporta. */
  async setTorch(on: boolean): Promise<boolean> {
    const track = this.videoTrack;
    if (!track || typeof track.applyConstraints !== "function") return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] } as MediaTrackConstraints);
      return true;
    } catch {
      return false;
    }
  }
  /** Aplica zoom (1 = padrão; 2 = 2x) quando o aparelho suporta. Retorna false se não suporta. */
  async setZoom(level: number): Promise<boolean> {
    const track = this.videoTrack;
    if (!track || typeof track.applyConstraints !== "function") return false;
    try {
      await track.applyConstraints({ advanced: [{ zoom: level }] } as MediaTrackConstraints);
      return true;
    } catch {
      return false;
    }
  }
  stop(): void {
    this.active = false;
    if (this.video) {
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }
    try {
      this.controls?.stop();
    } catch {
      /* já encerrado */
    }
    this.controls = null;
    this.reader = null;
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.videoTrack = null;
    if (this.target) {
      this.target.innerHTML = "";
      this.target = null;
    }
    this.onDetected = null;
    this.onModeChange = null;
  }
}