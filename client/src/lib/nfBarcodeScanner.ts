import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

/*
 * Leitor da DANFE (chave de acesso de 44 dígitos) — híbrido de alta confiabilidade.
 * HISTÓRICO (para nunca se perder):
 * - 21/09/2026: Quagga2 (JS puro) — Android abria a câmera mas nunca lia.
 * - 22/09/2026 (manhã): BarcodeDetector nativo + fallback Quagga — seguiu sem ler.
 * - 22/09/2026 (tarde): ZXing — câmera abre, mas ainda não leu no aparelho, embora
 *   o app de câmera e o leitor de QR do celular leiam o mesmo código.
 * - 22/09/2026 (V4): decisão registrada — o problema não é simbologia nem impressão;
 *   é a qualidade/foco do VÍDEO AO VIVO no navegador. Solução: (1) motor nativo do
 *   navegador quando existir (mais rápido) e ZXing como contínuo quando não; (2)
 *   botão "Fotografar e ler": congela um quadro em alta resolução e lê nele, como
 *   um app de câmera; (3) lanterna e zoom quando o aparelho suportar; (4) indicador
 *   de modo na tela para diagnóstico remoto.
 * REGRAS:
 * - Só vale chave com exatamente 44 dígitos (normalizeNfBarcodeValue). Leitura
 *   contínua em modo filmagem é o comportamento normal de leitor.
 */
export const nfBarcodeFormats = [BarcodeFormat.CODE_128, BarcodeFormat.ITF, BarcodeFormat.CODE_39];

/** Deixa apenas os dígitos e garante a chave de 44 posições. Retorna null se inválida. */
export function normalizeNfBarcodeValue(value: string | null | undefined) {
  const accessKey = (value ?? "").replace(/\D/g, "").slice(0, 44);
  return accessKey.length === 44 ? accessKey : null;
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

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    this.stream = stream;
    const track = stream.getVideoTracks()[0];
    this.videoTrack = track ?? null;

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
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, nfBarcodeFormats);
    hints.set(DecodeHintType.TRY_HARDER, true);
    this.reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 250 });
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

  /** Congela um quadro em alta resolução e tenta ler nele. Retorna true se leu. */
  async captureStill(): Promise<boolean> {
    const { video, detector, reader } = this;
    if (!this.active || !video || video.readyState < 2) return false;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
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

    if (reader) {
      try {
        const result = await reader.decodeFromCanvas(canvas);
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