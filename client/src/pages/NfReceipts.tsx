import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { createNfBarcodeScannerConfig, normalizeNfBarcodeValue } from "@/lib/nfBarcodeScanner";
import Quagga, { type QuaggaJSResultCallbackFunction } from "@ericblade/quagga2";
import { Barcode, Camera, CheckCircle2, Keyboard, LoaderCircle, ScanLine, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type CaptureMethod = "manual" | "camera" | "barcode_reader";

const clean = (value: string) => value.replace(/\D/g, "").slice(0, 44);
const labels: Record<CaptureMethod, string> = {
  manual: "Digitação",
  camera: "Câmera",
  barcode_reader: "Leitor de mesa",
};
const modeHelp: Record<CaptureMethod, string> = {
  manual: "Digite ou cole os 44 dígitos da chave de acesso.",
  barcode_reader: "Deixe o cursor no campo e faça a leitura; o leitor de mesa funciona como teclado.",
  camera: "Posicione o código de barras da DANFE na faixa do leitor. No computador, a webcam será usada automaticamente.",
};
export default function NfReceipts() {
  const [accessKey, setAccessKey] = useState("");
  const [captureMethod, setCaptureMethod] = useState<CaptureMethod>("manual");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const detectedHandlerRef = useRef<QuaggaJSResultCallbackFunction | null>(null);
  const scannerActiveRef = useRef(false);
  const scannerSessionRef = useRef(0);
  const recent = trpc.nfReceipts.recent.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();

  const stopCamera = useCallback(() => {
    scannerSessionRef.current += 1;
    if (detectedHandlerRef.current) Quagga.offDetected(detectedHandlerRef.current);
    detectedHandlerRef.current = null;
    if (scannerActiveRef.current) void Quagga.stop().catch(() => undefined);
    scannerActiveRef.current = false;
    setCameraOpen(false);
    setCameraStarting(false);
  }, []);

  const capture = trpc.nfReceipts.capture.useMutation({
    onSuccess: data => {
      toast.success(`NF registrada às ${new Date(data.capturedAt).toLocaleTimeString("pt-BR")}.`);
      utils.nfReceipts.recent.invalidate();
      setAccessKey("");
      stopCamera();
    },
    onError: error => toast.error(error.message),
  });

  const startCamera = useCallback(async () => {
    if (!scannerRef.current || scannerActiveRef.current) return;
    const session = scannerSessionRef.current + 1;
    scannerSessionRef.current = session;
    setCameraError(null);
    setCameraStarting(true);
    try {
      await Quagga.init(createNfBarcodeScannerConfig(scannerRef.current));
      if (session !== scannerSessionRef.current) {
        await Quagga.stop().catch(() => undefined);
        return;
      }
      const onDetected: QuaggaJSResultCallbackFunction = result => {
        const key = normalizeNfBarcodeValue(result.codeResult?.code);
        if (!key) return;
        setAccessKey(key);
        toast.success("Código de barras identificado. Revise a chave antes de registrar a NF.");
        stopCamera();
      };
      detectedHandlerRef.current = onDetected;
      Quagga.onDetected(onDetected);
      Quagga.start();
      scannerActiveRef.current = true;
    } catch (error) {
      if (session !== scannerSessionRef.current) return;
      scannerActiveRef.current = false;
      setCameraOpen(false);
      setCameraError(error instanceof DOMException && error.name === "NotAllowedError"
        ? "O uso da câmera não foi autorizado. Libere a permissão de câmera do navegador e tente novamente."
        : "Não foi possível iniciar o leitor automático. Feche qualquer outro aplicativo que esteja usando a câmera e tente novamente.");
    } finally {
      setCameraStarting(false);
    }
  }, []);

  useEffect(() => {
    if (captureMethod === "camera" && cameraOpen) void startCamera();
  }, [cameraOpen, captureMethod, startCamera]);

  useEffect(() => () => { if (scannerActiveRef.current) void Quagga.stop().catch(() => undefined); }, []);

  const submit = () => capture.mutate({ accessKey, captureMethod });
  const changeMode = (next: CaptureMethod) => {
    setCaptureMethod(next);
    setCameraError(null);
    if (next === "camera") setCameraOpen(true);
    else stopCamera();
  };
  const retryCamera = () => {
    setCameraError(null);
    setCameraOpen(true);
  };

  return (
    <div className="page-wrap">
      <header className="mb-7">
        <p className="eyebrow">Recebimentos · Nota fiscal</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl">Recebimento simples de NF</h1>
        <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-500">Registre a chave de acesso da NF. O portal grava automaticamente o usuário autenticado, a data e a hora da leitura, além de preparar campos para cruzamento futuro com SC7 e NF Legal.</p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1.06fr_.94fr]">
        <section className="sc-surface p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1ccd7] text-slate-950"><ScanLine className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-950">Capturar chave de acesso</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Escolha como preencher o único campo de chave e registre os 44 dígitos.</p>
            </div>
          </div>

          <div className="mt-6">
            <label className="text-sm font-extrabold text-slate-800">Modo de coleta</label>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(["manual", "barcode_reader", "camera"] as CaptureMethod[]).map(mode => (
                <Button key={mode} type="button" variant={captureMethod === mode ? "default" : "outline"} onClick={() => changeMode(mode)} className={captureMethod === mode ? "bg-slate-950 hover:bg-slate-800" : ""}>
                  {mode === "manual" ? <Keyboard className="mr-2 h-4 w-4" /> : mode === "barcode_reader" ? <Barcode className="mr-2 h-4 w-4" /> : <Camera className="mr-2 h-4 w-4" />}
                  {labels[mode]}
                </Button>
              ))}
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500">{modeHelp[captureMethod]}</p>
          </div>

          <div className="mt-6">
            <label className="text-sm font-extrabold text-slate-800">Chave de acesso da NF</label>
            <div className="mt-2 flex gap-2">
              <Input autoFocus inputMode="numeric" placeholder="44 dígitos da chave de acesso" value={accessKey} onChange={event => setAccessKey(clean(event.target.value))} onKeyDown={event => { if (event.key === "Enter" && accessKey.length === 44) submit(); }} />
              <Button disabled={capture.isPending || accessKey.length !== 44} className="bg-slate-950 hover:bg-slate-800" onClick={submit}>
                {capture.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Registrar NF
              </Button>
            </div>
            <p className="mt-1.5 text-xs font-semibold text-slate-500">{accessKey.length}/44 dígitos</p>
          </div>

          {captureMethod === "camera" && (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold text-slate-800">Leitor de código pela câmera</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">O leitor reconhece automaticamente o Code 128 da DANFE. Mantenha o código na horizontal, dentro da faixa, e aproxime devagar até o foco ficar nítido.</p>
                </div>
                {cameraOpen ? <Button variant="outline" onClick={stopCamera}><X className="mr-2 h-4 w-4" />Encerrar câmera</Button> : <Button variant="outline" onClick={retryCamera}><Camera className="mr-2 h-4 w-4" />Iniciar leitor</Button>}
              </div>
              {cameraOpen && <div ref={scannerRef} className="relative mt-4 aspect-video overflow-hidden rounded-xl bg-slate-950 [&_canvas]:absolute [&_canvas]:inset-0 [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-cover [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />}
              {cameraStarting && <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Iniciando leitor de código…</p>}
              {cameraError && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{cameraError}</p>}
            </div>
          )}
        </section>

        <section className="sc-surface overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-7">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d8ebfa] text-slate-950"><ShieldCheck className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-950">Últimas leituras</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Registro auditável com usuário, data e hora.</p>
            </div>
          </div>
          {recent.isLoading ? <div className="flex items-center gap-2 p-7 text-sm font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando leituras…</div> : recent.data?.length ? <div className="divide-y divide-slate-100">{recent.data.map(item => <div className="px-5 py-4 sm:px-7" key={item.id}><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold tracking-[0.08em] text-slate-800">{item.accessKey}</p><p className="mt-1 text-xs font-semibold text-slate-500">NF {Number(item.invoiceNumber)} · Série {Number(item.invoiceSeries)} · CNPJ {item.issuerCnpj}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-600">{labels[item.captureMethod]}</span></div><p className="mt-2 text-xs font-semibold text-slate-500">{new Date(item.capturedAt).toLocaleString("pt-BR")} · {item.capturedBy ?? "Usuário do portal"}</p></div>)}</div> : <div className="p-7 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-500">Nenhuma chave foi registrada ainda.</p></div>}
        </section>
      </div>
    </div>
  );
}
