import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { NfBarcodeScanner } from "@/lib/nfBarcodeScanner";
import { formatNfNumber, formatNfReceiptExportRows } from "../../../shared/nfReceiptExport";
import { Barcode, Camera, CheckCircle2, Download, Flashlight, FlashlightOff, Keyboard, LoaderCircle, ScanLine, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

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
  camera: "Posicione o código de barras da DANFE na frente da câmera, na horizontal, e aproxime devagar. Se o reconhecimento automático demorar, use o botão Fotografar e ler.",
};

// REGRA (22/09/2026): se a câmera abrir mas nenhum código for reconhecido
// em 20s, orientar o usuário em vez de manter silêncio.
const DETECT_TIMEOUT_MS = 20_000;

export default function NfReceipts() {
  const [accessKey, setAccessKey] = useState("");
  const [captureMethod, setCaptureMethod] = useState<CaptureMethod>("manual");
  const [activeView, setActiveView] = useState<"capture" | "history">("capture");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerMode, setScannerMode] = useState<"native" | "zxing" | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const scannerRef = useRef<HTMLDivElement>(null);
  const scannerInstanceRef = useRef<NfBarcodeScanner | null>(null);
  const scannerActiveRef = useRef(false);
  const scannerSessionRef = useRef(0);
  const detectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recent = trpc.nfReceipts.recent.useQuery(undefined, { retry: false });
  const exportRows = trpc.nfReceipts.exportRows.useQuery(undefined, { enabled: false, retry: false });
  const utils = trpc.useUtils();

  const clearDetectTimeout = useCallback(() => {
    if (detectTimeoutRef.current) {
      clearTimeout(detectTimeoutRef.current);
      detectTimeoutRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    scannerSessionRef.current += 1;
    clearDetectTimeout();
    scannerInstanceRef.current?.stop();
    scannerInstanceRef.current = null;
    scannerActiveRef.current = false;
    setCameraOpen(false);
    setCameraStarting(false);
    setScannerMode(null);
    setTorchOn(false);
  }, [clearDetectTimeout]);

  const capture = trpc.nfReceipts.capture.useMutation({
    onSuccess: data => {
      toast.success(`NF ${formatNfNumber(data.invoiceNumber)} registrada às ${new Date(data.capturedAt).toLocaleTimeString("pt-BR")}.`);
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
    clearDetectTimeout();
    try {
      const instance = new NfBarcodeScanner();
      scannerInstanceRef.current = instance;
      await instance.start(
        scannerRef.current,
        key => {
          setAccessKey(key);
          toast.success("Código de barras identificado. Revise a chave antes de registrar a NF.");
          stopCamera();
        },
        mode => setScannerMode(mode),
      );
      if (session !== scannerSessionRef.current) {
        instance.stop();
        return;
      }
      scannerActiveRef.current = true;
      detectTimeoutRef.current = setTimeout(() => {
        if (!scannerActiveRef.current) return;
        setCameraError("Ainda não reconhecemos o código automaticamente. Aproxime a câmera, evite reflexo e toque em Fotografar e ler.");
      }, DETECT_TIMEOUT_MS);
    } catch (error) {
      clearDetectTimeout();
      if (session !== scannerSessionRef.current) return;
      scannerActiveRef.current = false;
      setCameraOpen(false);
      setCameraError(error instanceof DOMException && error.name === "NotAllowedError"
        ? "O uso da câmera não foi autorizado. Libere a permissão de câmera do navegador e tente novamente."
        : "Não foi possível iniciar o leitor automático. Feche qualquer outro aplicativo que esteja usando a câmera e tente novamente.");
    } finally {
      setCameraStarting(false);
    }
  }, [clearDetectTimeout]);

  useEffect(() => {
    if (captureMethod === "camera" && cameraOpen) void startCamera();
  }, [cameraOpen, captureMethod, startCamera]);

  useEffect(() => () => {
    clearDetectTimeout();
    scannerInstanceRef.current?.stop();
  }, [clearDetectTimeout]);

  const handlePhoto = async () => {
    const instance = scannerInstanceRef.current;
    if (!instance || photoBusy || !scannerActiveRef.current) return;
    setPhotoBusy(true);
    try {
      const ok = await instance.captureStill();
      if (!ok) toast.error("Ainda não li o código. Aproxime, evite reflexo e toque em Fotografar e ler de novo.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const toggleTorch = async () => {
    const instance = scannerInstanceRef.current;
    if (!instance) return;
    const next = !torchOn;
    const ok = await instance.setTorch(next);
    if (!ok) {
      toast.info("Seu aparelho não permite acender a lanterna pelo portal.");
      return;
    }
    setTorchOn(next);
  };

  const changeZoom = async (level: number) => {
    setZoomLevel(level);
    const ok = await scannerInstanceRef.current?.setZoom(level);
    if (ok === false) toast.info("Seu aparelho não permite zoom pelo portal.");
  };

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

  const exportReadings = async () => {
    const response = await exportRows.refetch();
    if (response.error) { toast.error(response.error.message); return; }
    const rows = response.data ?? [];
    if (!rows.length) { toast.error("Ainda não há leituras para exportar."); return; }
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(formatNfReceiptExportRows(rows));
    worksheet["!cols"] = [
      { wch: 48 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 },
      { wch: 20 }, { wch: 28 }, { wch: 22 }, { wch: 26 }, { wch: 24 }, { wch: 24 },
    ];
    worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leituras NF");
    XLSX.writeFile(workbook, `leituras_nf_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${rows.length} leitura(s) exportada(s) em planilha.`);
  };

  return (
    <div className="page-wrap">
      <header className="mb-7">
        <p className="eyebrow">Recebimentos · Nota fiscal</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl">Recebimento simples de NF</h1>
        <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-500">Registre a chave de acesso da NF. O portal grava automaticamente o usuário autenticado, a data e a hora da leitura, além de preparar campos para cruzamento futuro com SC7 e NF Legal.</p>
      </header>
      <nav aria-label="Seções do recebimento" className="mb-5 grid max-w-md grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1"><button type="button" onClick={() => setActiveView("capture")} className={`rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${activeView === "capture" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>Capturar chave</button><button type="button" onClick={() => setActiveView("history")} className={`rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${activeView === "history" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>Histórico e exportação</button></nav>
      <div className="grid gap-5 xl:grid-cols-[1.06fr_.94fr]">
        {activeView === "capture" && <section className="sc-surface p-5 sm:p-7">
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
                  <p className="mt-1 text-xs font-semibold text-slate-500">O leitor tenta reconhecer sozinho. Se não reconhecer em alguns segundos, toque em Fotografar e ler. Mantenha o código na horizontal e sem reflexo.</p>
                </div>
                {cameraOpen ? <Button variant="outline" onClick={stopCamera}><X className="mr-2 h-4 w-4" />Encerrar câmera</Button> : <Button variant="outline" onClick={retryCamera}><Camera className="mr-2 h-4 w-4" />Iniciar leitor</Button>}
              </div>
              {cameraOpen && <div ref={scannerRef} className="relative mt-4 aspect-video overflow-hidden rounded-xl bg-slate-950 [&_canvas]:absolute [&_canvas]:inset-0 [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-cover [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />}
              {cameraStarting && <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Iniciando leitor de código…</p>}
              {cameraError && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{cameraError}</p>}
              {scannerMode && (
                <p className="mt-3 text-xs font-semibold text-slate-500">
                  {scannerMode === "native" ? "Modo: leitor rápido" : "Modo: leitor compatível"}
                </p>
              )}
              {cameraOpen && !cameraStarting && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button onClick={() => void handlePhoto()} disabled={photoBusy}>
                    {photoBusy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                    {photoBusy ? "Lendo…" : "Fotografar e ler"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void toggleTorch()}>
                    {torchOn ? <FlashlightOff className="mr-1.5 h-4 w-4" /> : <Flashlight className="mr-1.5 h-4 w-4" />}
                    {torchOn ? "Lanterna ligada" : "Lanterna"}
                  </Button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">Zoom</span>
                    <input type="range" min={1} max={4} step={0.5} value={zoomLevel} onChange={event => void changeZoom(Number(event.target.value))} className="w-28" />
                  </div>
                </div>
              )}
            </div>
          )}
        </section>}
        {activeView === "history" && <section className="sc-surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-7">
            <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d8ebfa] text-slate-950"><ShieldCheck className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-950">Últimas leituras</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Registro auditável com usuário, data e hora.</p>
            </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => void exportReadings()} disabled={exportRows.isFetching}><Download className="mr-2 h-4 w-4" />{exportRows.isFetching ? "Preparando…" : "Exportar Excel"}</Button>
          </div>
          {recent.isLoading ? <div className="flex items-center gap-2 p-7 text-sm font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando leituras…</div> : recent.data?.length ? <div className="divide-y divide-slate-100">{recent.data.map(item => <div className="px-5 py-4 sm:px-7" key={item.id}><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold tracking-[0.08em] text-slate-800">{item.accessKey}</p><p className="mt-1 text-xs font-semibold text-slate-500">NF {formatNfNumber(item.invoiceNumber)} · Série {item.invoiceSeries} · CNPJ {item.issuerCnpj}</p>{item.supplier ? <p className="mt-1 text-xs font-bold text-slate-700">Fornecedor: {item.supplier.tradeName || item.supplier.legalName} · Código {item.supplier.code} · Loja {item.supplier.store}</p> : <p className="mt-1 text-xs font-semibold text-amber-700">Fornecedor não identificado no cadastro ativo.</p>}</div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-600">{labels[item.captureMethod]}</span></div><p className="mt-2 text-xs font-semibold text-slate-500">{new Date(item.capturedAt).toLocaleString("pt-BR")} · {item.capturedBy ?? "Usuário do portal"}</p></div>)}</div> : <div className="p-7 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-500">Nenhuma chave foi registrada ainda.</p></div>}
        </section>}
      </div>
    </div>
  );
}