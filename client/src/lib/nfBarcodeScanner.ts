import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { nfScannerFastConstraints, nfScannerFastDelayMs } from "./nfScannerConfig";
/*
 * Leitor da DANFE (chave de acesso de 44 dígitos) — híbrido de alta confiabilidade.
 * HISTÓRICO (para nunca se perder):
 * - 21/09/2026: Quagga2 (JS puro) — Android abria a câmera mas nunca lia.
 * - 22/09/2026 (manhã): BarcodeDetector nativo + fallback Quagga — seguiu sem ler.
 * - 22/09/2026 (tarde): ZXing — câmera abre, mas ainda não leu no aparelho, embora
 *   o app de câmera e o leitor de QR do celular leiam o mesmo código.
 * - 22/09/2026 (V4): o problema é a qualidade/foco do VÍDEO AO VIVO no navegador.
 *   Solução: motor nativo quando existir (mais rápido) + ZXing como contínuo quando
 *   não; botão "Fotografar e ler" (congela quadro em alta resolução e lê); lanterna
 *   e zoom quando o aparelho suportar; indicador de modo na tela.
 * - 25/09/2026 (BLOCO 3 — ACELERAÇÃO): câmera abre em 1280x720 (muito menos
 *   trabalho por tentativa); foco automático contínuo quando suportado; leitor
 *   compatível com 90ms entre tentativas e SEM "tentativa reforçada" no modo
 *   contínuo (a reforçada fica só no botão Fotografar e ler).
 * - 25/09/2026 (BLOCO 4 — CHAVE ERRADA): validação do DÍGITO VERIFICADOR (DV,
 *   módulo 11) da chave de acesso. Se a leitura vier com dígito errado, o leitor
 *   DESCARTÁ e continua escaneando — evita gravar uma NF diferente da escaneada.
 * REGRAS:
 * - Só vale chave com exatamente 44 dígitos E dígito verificador correto.
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
  // BLOCO 4: só aceita chave com dígito verificador correto (evita leitura errada)
  return accessKey.length === 44 && isValidNfAccessKey(accessKey) ? accessKey : null;
}
type NativeDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => NativeDetector;
async function createNativeDetector(): Promise<NativeDetector | null> {
  try {
    const w = window as unknown as {
      BarcodeDetector?: BarcodeDetectorCtor & { getSupportedFormats?: () => Promise<string[]> | string[] };
    };
    const BD = w.BarcodeDetector;
    if (!BD) return null;
    const formats = BD.getSupportedFormats ? await BD.getSupportedFormats() : [];
    const list = Array.isArray(formats) ? formats : [];
    if (!list.includes("code_128")) return null;
    return new BD({ formats: ["code_128"] });
  } catch {
    return null;
  }
}
/** Tenta ativar o foco automático contínuo (melhora muito a leitura no celular). */
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
    this.detector = await createNativeDetector();
    // BLOCO 3: câmera abre em 1280x720 (mais rápido) em vez de 1920x1080
    const stream = await navigator.mediaDevices.getUserMedia({
      video: nfScannerFastConstraints,
      audio: false,
    });
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
    if (this.detector) {
      this.onModeChange?.("native");
      this.loopNative();
      return;
    }
    this.onModeChange?.("zxing");
    // BLOCO 3: no modo contínuo compatível, SEM "tentativa reforçada" (é caro).
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
  private loopNative = () => {
    if (!this.active || !this.video || !this.detector) return;
    if (this.video.readyState >= 2) {
      this.detector
        .detect(this.video)
        .then(codes => {
          if (!this.active) return;
          for (const code of codes) {
            const key = normalizeNfBarcodeValue(code.rawValue);
            if (key) {
              this.onDetected?.(key);
              return;
            }
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (this.active) this.rafId = requestAnimationFrame(this.loopNative);
        });
    } else {
      this.rafId = requestAnimationFrame(this.loopNative);
    }
  };
  /** Congela um quadro e tenta ler nele. Retorna true se leu. */
  async captureStill(): Promise<boolean> {
    const { video, detector } = this;
    if (!this.active || !video || video.readyState < 2) return false;
    let width = video.videoWidth || 1280;
    let height = video.videoHeight || 720;
    // BLOCO 3: limita o quadro a 1280px para acelerar a leitura da foto
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
    // Na foto, vale usar "tentativa reforçada" (quadro congelado de alta qualidade)
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