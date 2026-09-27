import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { nfScannerFastDelayMs } from "./nfScannerConfig";
/*
 * Leitor da DANFE (chave de acesso de 44 dígitos) — híbrido de alta confiabilidade.
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
 * - 27/09/2026 (CORREÇÃO FINAL — HÍBRIDO): o Android não lia porque o modo contínuo
 *   usava APENAS o leitor nativo (BarcodeDetector), que falha em códigos longos de
 *   44 dígitos. O iOS lia porque usava o ZXing. Agora o Android tenta o NATIVO e,
 *   se não achar, o ZXing no MESMO quadro, em 1280x720 (mesma receita rápida do iOS).
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
/** Detecta o sistema operacional do aparelho. */
export function detectPlatform(): "android" | "ios" | "other" {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/android/i.test(ua)) return "android";
  if (/iPad|iPhone|iPod/i.test(ua)) return "ios";
  return "other";
}
type NativeDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => NativeDetector;
/** Cria o leitor nativo de forma robusta. */
async function createNativeDetector(): Promise<NativeDetector | null> {
  try {
    const w = window as unknown as {
      BarcodeDetector?: BarcodeDetectorCtor & { getSupportedFormats?: () => Promise<string[]> | string[] };
    };
    const BD = w.BarcodeDetector;
    if (!BD) return null;
    try {
      return new BD({ formats: ["code_128"] });
    } catch {
      /* se falhar, tenta sem formatos */
    }
    return new BD();
  } catch {
    return null;
  }
}
/** Tenta ativar o foco automático contínuo. */
async function tryEnableContinuousFocus(track: MediaStreamTrack | null | undefined) {
  if (!track || typeof track.applyConstraints !== "function") return;
  try {
    await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] } as MediaTrackConstraints);
  } catch {
    /* aparelho sem suporte — segue sem foco contínuo */
  }
}
export class NfBarcodeScanner {
  private target: HTMLElement | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private detector: NativeDetector | null = null;
  private reader: BrowserMultiFormatReader | null = null;
  private controls: { stop: () => void } | null = null;
  private rafId = 0;
  private active = false;
  private onDetected: ((key: string) => void) | null = null;
  private onModeChange: ((mode: "native" | "zxing" | "hybrid") => void) | null = null;
  private lastAttempt = 0;
  async start(
    target: HTMLElement,
    onDetected: (key: string) => void,
    onModeChange?: (mode: "native" | "zxing" | "hybrid") => void,
  ): Promise<void> {
    this.stop();
    this.target = target;
    this.onDetected = onDetected;
    this.onModeChange = onModeChange ?? null;
    this.active = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("camera-unavailable");
    }
    const platform = detectPlatform();
    this.detector = await createNativeDetector();
    // CORREÇÃO FINAL: TODOS os sistemas usam 1280x720 (a receita rápida do iOS).
    // Resolução maior pesa e não ajuda o ZXing em código longo.
    const videoConstraints: MediaTrackConstraints = {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, min: 15 },
    };
    const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
    this.stream = stream;
    const track = stream.getVideoTracks()[0];
    this.videoTrack = track ?? null;
    await tryEnableContinuousFocus(track);
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
    // CORREÇÃO FINAL: modo HÍBRIDO — tenta nativo e, se não achar, ZXing no mesmo quadro.
    // No Android isso resolve o "não lê"; no iOS mantém o ZXing que já é rápido.
    this.onModeChange?.(this.detector ? "hybrid" : "zxing");
    this.loopHybrid();
  }
  // CORREÇÃO FINAL: leitura contínua leve e híbrida. A cada quadro (com intervalo
  // ~100ms), tenta o nativo; se não achar, tenta o ZXing no MESMO quadro. Sem
  // máximo esforço no contínuo (leve, não trava). Valida o dígito verificador.
  private loopHybrid = () => {
    if (!this.active || !this.video || this.video.readyState < 2) {
      if (this.active) this.rafId = requestAnimationFrame(this.loopHybrid);
      return;
    }
    const now = performance.now();
    if (now - this.lastAttempt >= 100) {
      this.lastAttempt = now;
      this.detectCurrentFrame();
    }
    this.rafId = requestAnimationFrame(this.loopHybrid);
  };
  /** Detecta no quadro atual: tenta nativo, depois ZXing. Não bloqueia o ciclo. */
  private detectCurrentFrame() {
    const { video, detector } = this;
    if (!video || video.readyState < 2) return;
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
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    // 1) Leitor nativo (rápido quando funciona)
    if (detector) {
      detector
        .detect(canvas)
        .then(codes => {
          if (!this.active) return;
          for (const code of codes) {
            const key = normalizeNfBarcodeValue(code.rawValue);
            if (key) {
              this.onDetected?.(key);
              return;
            }
          }
          // Não achou no nativo — tenta o ZXing no mesmo quadro.
          this.tryZxingOnCanvas(canvas);
        })
        .catch(() => this.tryZxingOnCanvas(canvas));
    } else {
      this.tryZxingOnCanvas(canvas);
    }
  }
  /** Tenta ler com o ZXing no quadro atual (sem máximo esforço no contínuo). */
  private tryZxingOnCanvas(canvas: HTMLCanvasElement) {
    if (!this.active) return;
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, nfBarcodeFormats);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: nfScannerFastDelayMs });
    reader
      .decodeFromCanvas(canvas)
      .then(result => {
        if (!this.active || !result) return;
        const key = normalizeNfBarcodeValue(result.getText());
        if (key) this.onDetected?.(key);
      })
      .catch(() => undefined);
  }
  /** Congela um quadro e tenta ler nele — usado APENAS no botão "Fotografar e ler". */
  async captureStill(): Promise<boolean> {
    const { video, detector } = this;
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
    if (detector) {
      try {
        const codes = await detector.detect(canvas);
        for (const code of codes) {
          const key = normalizeNfBarcodeValue(code.rawValue);
          if (key) {
            this.onDetected?.(key);
            return true;
          }
        }
      } catch {
        /* tenta o ZXing abaixo */
      }
    }
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
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
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
    this.detector = null;
    this.onDetected = null;
    this.onModeChange = null;
  }
}