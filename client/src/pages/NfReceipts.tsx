import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { NfBarcodeScanner } from "@/lib/nfBarcodeScanner";
import { formatNfNumber, formatNfReceiptExportRows } from "../../../shared/nfReceiptExport";
import { Barcode, Camera, CheckCircle2, Download, FileUp, Flashlight, FlashlightOff, Keyboard, LoaderCircle, MapPin, Pencil, ScanLine, ShieldCheck, Trash2, Truck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
type CaptureMethod = "manual" | "camera" | "barcode_reader";
type ReadingPoint = "descarga" | "recebimento" | "conferencia" | "envio_fiscal";
// BLOCO 1 (25/09/2026): nova ordem do fluxo — Recebimento (1º) → Descarga → Conferência → Envio ao fiscal.
// O transporte (transportadora + placa) agora pertence ao Recebimento, que é o primeiro passo.
const readingPoints: ReadingPoint[] = ["recebimento", "descarga", "conferencia", "envio_fiscal"];
const readingPointLabels: Record<ReadingPoint, string> = { descarga: "Descarga", recebimento: "Recebimento", conferencia: "Conferência", envio_fiscal: "Envio ao fiscal" };
const clean = (value: string) => value.replace(/\D/g, "").slice(0, 44);
const labels: Record<CaptureMethod, string> = { manual: "Digitação", camera: "Câmera", barcode_reader: "Leitor de mesa" };
const modeHelp: Record<CaptureMethod, string> = {
  manual: "Digite ou cole os 44 dígitos da chave de acesso.",
  barcode_reader: "Deixe o cursor no campo e faça a leitura; o leitor de mesa funciona como teclado.",
  camera: "Posicione o código de barras da DANFE na frente da câmera, na horizontal, e aproxime devagar.",
};
const DETECT_TIMEOUT_MS = 20_000;
const cell = (value: unknown) => String(value ?? "").trim();
export default function NfReceipts() {
  const [accessKey, setAccessKey] = useState("");
  const [captureMethod, setCaptureMethod] = useState<CaptureMethod>("manual");
  const [readingPoint, setReadingPoint] = useState<ReadingPoint>("recebimento");
  const [activeView, setActiveView] = useState<"capture" | "history" | "carriers">("capture");
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
  // Controle
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingPoint, setEditingPoint] = useState<ReadingPoint>("recebimento");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // Recebimento (transporte) — BLOCO 1: campos de transportadora + placa agora pertencem ao Recebimento
  const [carrierId, setCarrierId] = useState("");
  const [useManualCarrier, setUseManualCarrier] = useState(false);
  const [carrierManualName, setCarrierManualName] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  // Transportadoras (SA4)
  const [carrierRows, setCarrierRows] = useState<{ code: string; name: string; cnpj: string; city: string; uf: string }[] | null>(null);
  const [carrierSourceFile, setCarrierSourceFile] = useState("");
  const recent = trpc.nfReceipts.recent.useQuery(undefined, { retry: false });
  const exportRows = trpc.nfReceipts.exportRows.useQuery(undefined, { enabled: false, retry: false });
  const carriers = trpc.carriers.list.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const clearDetectTimeout = useCallback(() => {
    if (detectTimeoutRef.current) { clearTimeout(detectTimeoutRef.current); detectTimeoutRef.current = null; }
  }, []);
  const stopCamera = useCallback(() => {
    scannerSessionRef.current += 1;
    clearDetectTimeout();
    scannerInstanceRef.current?.stop();
    scannerInstanceRef.current = null;
    scannerActiveRef.current = false;
    setCameraOpen(false); setCameraStarting(false); setScannerMode(null); setTorchOn(false);
  }, [clearDetectTimeout]);
  const capture = trpc.nfReceipts.capture.useMutation({
    onSuccess: data => { toast.success(`NF ${formatNfNumber(data.invoiceNumber)} registrada às ${new Date(data.capturedAt).toLocaleTimeString("pt-BR")}.`); utils.nfReceipts.recent.invalidate(); setAccessKey(""); setCarrierId(""); setUseManualCarrier(false); setCarrierManualName(""); setVehiclePlate(""); stopCamera(); },
    onError: error => toast.error(error.message),
  });
  const updatePoint = trpc.nfReceipts.updateReadingPoint.useMutation({
    onSuccess: () => { toast.success("Ponto de leitura atualizado."); utils.nfReceipts.recent.invalidate(); setEditingId(null); setReason(""); },
    onError: error => toast.error(error.message),
  });
  const removeReading = trpc.nfReceipts.remove.useMutation({
    onSuccess: () => { toast.success("Leitura removida da lista (registro preservado)."); utils.nfReceipts.recent.invalidate(); setRemovingId(null); setReason(""); },
    onError: error => toast.error(error.message),
  });
  const importCarriers = trpc.carriers.import.useMutation({
    onSuccess: data => {
      toast.success(`${data.imported} cadastrada(s), ${data.updated} atualizada(s), ${data.skipped} ignorada(s).`);
      if (data.warnings.length) data.warnings.slice(0, 5).forEach(w => toast.info(w));
      utils.carriers.list.invalidate();
      setCarrierRows(null);
      setCarrierSourceFile("");
    },
    onError: error => toast.error(error.message),
  });
  const startCamera = useCallback(async () => {
    if (!scannerRef.current || scannerActiveRef.current) return;
    const session = scannerSessionRef.current + 1;
    scannerSessionRef.current = session;
    setCameraError(null); setCameraStarting(true); clearDetectTimeout();
    try {
      const instance = new NfBarcodeScanner();
      scannerInstanceRef.current = instance;
      await instance.start(scannerRef.current, key => { setAccessKey(key); toast.success("Código de barras identificado. Revise a chave antes de registrar a NF."); stopCamera(); }, mode => setScannerMode(mode));
      if (session !== scannerSessionRef.current) { instance.stop(); return; }
      scannerActiveRef.current = true;
      detectTimeoutRef.current = setTimeout(() => { if (!scannerActiveRef.current) return; setCameraError("Ainda não reconhecemos o código automaticamente. Aproxime a câmera, evite reflexo e toque em Fotografar e ler."); }, DETECT_TIMEOUT_MS);
    } catch (error) {
      clearDetectTimeout();
      if (session !== scannerSessionRef.current) return;
      scannerActiveRef.current = false; setCameraOpen(false);
      setCameraError(error instanceof DOMException && error.name === "NotAllowedError" ? "O uso da câmera não foi autorizado. Libere a permissão de câmera do navegador e tente novamente." : "Não foi possível iniciar o leitor automático. Feche qualquer outro aplicativo que esteja usando a câmera e tente novamente.");
    } finally { setCameraStarting(false); }
  }, [clearDetectTimeout]);
  useEffect(() => { if (captureMethod === "camera" && cameraOpen) void startCamera(); }, [cameraOpen, captureMethod, startCamera]);
  useEffect(() => () => { clearDetectTimeout(); scannerInstanceRef.current?.stop(); }, [clearDetectTimeout]);
  const handlePhoto = async () => {
    const instance = scannerInstanceRef.current;
    if (!instance || photoBusy || !scannerActiveRef.current) return;
    setPhotoBusy(true);
    try { const ok = await instance.captureStill(); if (!ok) toast.error("Ainda não li o código. Aproxime, evite reflexo e toque em Fotografar e ler de novo."); } finally { setPhotoBusy(false); }
  };
  const toggleTorch = async () => {
    const instance = scannerInstanceRef.current;
    if (!instance) return;
    const next = !torchOn;
    const ok = await instance.setTorch(next);
    if (!ok) { toast.info("Seu aparelho não permite acender a lanterna pelo portal."); return; }
    setTorchOn(next);
  };
  const changeZoom = async (level: number) => { setZoomLevel(level); const ok = await scannerInstanceRef.current?.setZoom(level); if (ok === false) toast.info("Seu aparelho não permite zoom pelo portal."); };
  const submit = () => {
    capture.mutate({
      accessKey,
      captureMethod,
      readingPoint,
      carrierId: !useManualCarrier && carrierId ? carrierId : null,
      carrierName: useManualCarrier && carrierManualName.trim() ? carrierManualName.trim() : null,
      vehiclePlate: vehiclePlate || null,
    });
  };
  const changeMode = (next: CaptureMethod) => { setCaptureMethod(next); setCameraError(null); if (next === "camera") setCameraOpen(true); else stopCamera(); };
  const retryCamera = () => { setCameraError(null); setCameraOpen(true); };
  const exportReadings = async () => {
    const response = await exportRows.refetch();
    if (response.error) { toast.error(response.error.message); return; }
    const rows = response.data ?? [];
    if (!rows.length) { toast.error("Ainda não há leituras para exportar."); return; }
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(formatNfReceiptExportRows(rows));
    worksheet["!cols"] = [{ wch: 48 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 30 }, { wch: 16 }];
    worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leituras NF");
    XLSX.writeFile(workbook, `leituras_nf_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${rows.length} leitura(s) exportada(s) em planilha.`);
  };
  const handleCarrierFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const rows = raw.map(row => ({
        code: cell(row["A4_COD"] ?? row["Codigo"] ?? row["COD"] ?? row["Código"]),
        name: cell(row["A4_NOME"] ?? row["Nome"] ?? row["Razão Social"] ?? row["RAZAO"]),
        cnpj: cell(row["A4_CGC"] ?? row["CNPJ"] ?? row["Cgc"] ?? row["Documento"]),
        city: cell(row["A4_MUN"] ?? row["Cidade"] ?? row["CIDADE"] ?? row["Município"]),
        uf: cell(row["A4_EST"] ?? row["UF"] ?? row["Estado"] ?? row["UF"]),
      })).filter(row => row.name || row.code || row.cnpj);
      if (!rows.length) { toast.error("Nenhuma linha de transportadora encontrada no arquivo. Confira os cabeçalhos (A4_COD, A4_NOME, A4_CGC)."); return; }
      setCarrierRows(rows);
      setCarrierSourceFile(file.name);
      toast.success(`${rows.length} linha(s) lida(s) do arquivo. Revise e clique em Importar.`);
    } catch (error) {
      toast.error("Não foi possível ler o arquivo. Use uma planilha .xlsx ou .csv gerada pela SA4.");
    }
  };
  return (
    <div className="page-wrap">
      <header className="mb-7">
        <p className="eyebrow">Recebimentos · Nota fiscal</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl">Recebimento simples de NF</h1>
        {/* BLOCO 1: texto de apoio — o Recebimento é o primeiro passo e nele se informam transportadora e placa */}
        <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-500">Registre a chave de acesso da NF. A mesma NF pode passar por vários pontos de leitura. No Recebimento (primeiro passo), informe transportadora e placa (opcionais — nunca bloqueiam). Usuários com permissão de administrador podem corrigir o ponto ou remover leituras, sempre com motivo e registro de auditoria.</p>
      </header>
      <nav aria-label="Seções do recebimento" className="mb-5 grid max-w-xl grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
        {(["capture", "history", "carriers"] as const).map(view => (
          <button key={view} type="button" onClick={() => setActiveView(view)} className={`rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${activeView === view ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>
            {view === "capture" ? "Capturar chave" : view === "history" ? "Histórico e exportação" : "Transportadoras (SA4)"}
          </button>
        ))}
      </nav>
      <div className="grid gap-5 xl:grid-cols-[1.06fr_.94fr]">
        {activeView === "capture" && <section className="sc-surface p-5 sm:p-7">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1ccd7] text-slate-950"><ScanLine className="h-5 w-5" /></span><div><h2 className="text-lg font-extrabold tracking-tight text-slate-950">Capturar chave de acesso</h2><p className="mt-0.5 text-xs font-medium text-slate-500">Escolha como preencher o único campo de chave e registre os 44 dígitos.</p></div></div>
          {/* LEITOR NO TOPO */}
          {captureMethod === "camera" && (<div className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-extrabold text-slate-800">Leitor de código pela câmera</p><p className="mt-1 text-xs font-semibold text-slate-500">O leitor tenta reconhecer sozinho. Se não reconhecer em alguns segundos, toque em Fotografar e ler. Mantenha o código na horizontal e sem reflexo.</p></div>{cameraOpen ? <Button variant="outline" onClick={stopCamera}><X className="mr-2 h-4 w-4" />Encerrar câmera</Button> : <Button variant="outline" onClick={retryCamera}><Camera className="mr-2 h-4 w-4" />Iniciar leitor</Button>}</div>
            {cameraOpen && <div ref={scannerRef} className="relative mt-4 aspect-video overflow-hidden rounded-xl bg-slate-950 [&_canvas]:absolute [&_canvas]:inset-0 [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-cover [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />}
            {cameraStarting && <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Iniciando leitor de código…</p>}
            {cameraError && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{cameraError}</p>}
            {scannerMode && <p className="mt-3 text-xs font-semibold text-slate-500">{scannerMode === "native" ? "Modo: leitor rápido" : "Modo: leitor compatível"}</p>}
            {cameraOpen && !cameraStarting && (<div className="mt-3 flex flex-wrap items-center gap-3"><Button onClick={() => void handlePhoto()} disabled={photoBusy}>{photoBusy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}{photoBusy ? "Lendo…" : "Fotografar e ler"}</Button><Button variant="outline" size="sm" onClick={() => void toggleTorch()}>{torchOn ? <FlashlightOff className="mr-1.5 h-4 w-4" /> : <Flashlight className="mr-1.5 h-4 w-4" />}{torchOn ? "Lanterna ligada" : "Lanterna"}</Button><div className="flex items-center gap-2"><span className="text-xs font-semibold text-slate-500">Zoom</span><input type="range" min={1} max={4} step={0.5} value={zoomLevel} onChange={event => void changeZoom(Number(event.target.value))} className="w-28" /></div></div>)}
          </div>)}
          <div className="mt-6"><label className="text-sm font-extrabold text-slate-800">Modo de coleta</label><div className="mt-2 grid gap-2 sm:grid-cols-3">{(["manual", "barcode_reader", "camera"] as CaptureMethod[]).map(mode => (<Button key={mode} type="button" variant={captureMethod === mode ? "default" : "outline"} onClick={() => changeMode(mode)} className={captureMethod === mode ? "bg-slate-950 hover:bg-slate-800" : ""}>{mode === "manual" ? <Keyboard className="mr-2 h-4 w-4" /> : mode === "barcode_reader" ? <Barcode className="mr-2 h-4 w-4" /> : <Camera className="mr-2 h-4 w-4" />}{labels[mode]}</Button>))}</div><p className="mt-3 text-xs font-semibold text-slate-500">{modeHelp[captureMethod]}</p></div>
          <div className="mt-6"><label className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800"><MapPin className="h-4 w-4" /> Ponto de leitura</label><div className="mt-2 grid gap-2 sm:grid-cols-4">{readingPoints.map(point => (<Button key={point} type="button" variant={readingPoint === point ? "default" : "outline"} onClick={() => setReadingPoint(point)} className={readingPoint === point ? "bg-slate-950 hover:bg-slate-800" : ""}>{readingPointLabels[point]}</Button>))}</div><p className="mt-3 text-xs font-semibold text-slate-500">A mesma NF pode ser lida em vários pontos (Recebimento, Descarga, Conferência, Envio ao fiscal).</p></div>
          {/* BLOCO 1: CAMPOS DE TRANSPORTE — agora aparecem no ponto Recebimento (primeiro passo) */}
          {readingPoint === "recebimento" && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800"><Truck className="h-4 w-4" /> Dados do recebimento</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-extrabold text-slate-700">Transportadora</label>
                  {!useManualCarrier ? (
                    <select className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800" value={carrierId} onChange={event => { setCarrierId(event.target.value); if (event.target.value) setUseManualCarrier(false); }}>
                      <option value="">Não informada</option>
                      {carriers.data?.map(carrier => <option key={carrier.id} value={carrier.id}>{carrier.name}{carrier.cnpj ? ` · CNPJ ${carrier.cnpj}` : ""}</option>)}
                    </select>
                  ) : <Input className="mt-1" placeholder="Nome da transportadora (sem cadastro)" value={carrierManualName} onChange={event => setCarrierManualName(event.target.value)} />}
                  <button type="button" className="mt-1.5 text-xs font-bold text-indigo-700 hover:underline" onClick={() => { setUseManualCarrier(v => !v); setCarrierId(""); setCarrierManualName(""); }}>{useManualCarrier ? "Escolher do cadastro" : "Não está no cadastro — digitar nome"}</button>
                </div>
                <div>
                  <label className="text-xs font-extrabold text-slate-700">Placa do veículo</label>
                  <Input className="mt-1 uppercase" placeholder="Ex.: ABC1D23" maxLength={8} value={vehiclePlate} onChange={event => setVehiclePlate(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8))} />
                </div>
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-500">Campos opcionais: a leitura nunca é bloqueada por transportadora não cadastrada.</p>
            </div>
          )}
          <div className="mt-6"><label className="text-sm font-extrabold text-slate-800">Chave de acesso da NF</label><div className="mt-2 flex gap-2"><Input autoFocus inputMode="numeric" placeholder="44 dígitos da chave de acesso" value={accessKey} onChange={event => setAccessKey(clean(event.target.value))} onKeyDown={event => { if (event.key === "Enter" && accessKey.length === 44) submit(); }} /><Button disabled={capture.isPending || accessKey.length !== 44} className="bg-slate-950 hover:bg-slate-800" onClick={submit}>{capture.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Registrar NF</Button></div><p className="mt-1.5 text-xs font-semibold text-slate-500">{accessKey.length}/44 dígitos</p></div>
        </section>}
        {activeView === "history" && <section className="sc-surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-7"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d8ebfa] text-slate-950"><ShieldCheck className="h-5 w-5" /></span><div><h2 className="text-lg font-extrabold tracking-tight text-slate-950">Últimas leituras</h2><p className="mt-0.5 text-xs font-medium text-slate-500">Registro auditável com usuário, ponto, data, hora e dados do recebimento.</p></div></div><Button size="sm" variant="outline" onClick={() => void exportReadings()} disabled={exportRows.isFetching}><Download className="mr-2 h-4 w-4" />{exportRows.isFetching ? "Preparando…" : "Exportar Excel"}</Button></div>
          {recent.isLoading ? <div className="flex items-center gap-2 p-7 text-sm font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando leituras…</div> : recent.data?.length ? <div className="divide-y divide-slate-100">{recent.data.map(item => <div className="px-5 py-4 sm:px-7" key={item.id}><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold tracking-[0.08em] text-slate-800">{item.accessKey}</p><p className="mt-1 text-xs font-semibold text-slate-500">NF {formatNfNumber(item.invoiceNumber)} · Série {item.invoiceSeries} · CNPJ {item.issuerCnpj}</p>{item.supplier ? <p className="mt-1 text-xs font-bold text-slate-700">Fornecedor: {item.supplier.tradeName || item.supplier.legalName} · Código {item.supplier.code} · Loja {item.supplier.store}</p> : <p className="mt-1 text-xs font-semibold text-amber-700">Fornecedor não identificado no cadastro ativo.</p>}{item.carrierName ? <p className="mt-1 text-xs font-semibold text-slate-600">Transportadora: {item.carrierName}{item.vehiclePlate ? ` · Placa ${item.vehiclePlate}` : ""}</p> : null}</div><div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-600">{labels[item.captureMethod]}</span><Button size="sm" variant="ghost" onClick={() => { setEditingId(item.id); setEditingPoint(item.readingPoint); setReason(""); }} title="Corrigir ponto de leitura"><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={() => { setRemovingId(item.id); setReason(""); }} title="Remover leitura"><Trash2 className="h-4 w-4 text-rose-600" /></Button></div></div><div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-indigo-700">Ponto: {readingPointLabels[item.readingPoint] ?? "—"}</span><span className="text-xs font-semibold text-slate-500">{new Date(item.capturedAt).toLocaleString("pt-BR")} · {item.capturedBy ?? "Usuário do portal"}</span></div></div>)}</div> : <div className="p-7 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-500">Nenhuma chave foi registrada ainda.</p></div>}
        </section>}
        {activeView === "carriers" && <section className="sc-surface p-5 sm:p-7">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d9f0e3] text-slate-950"><Truck className="h-5 w-5" /></span><div><h2 className="text-lg font-extrabold tracking-tight text-slate-950">Transportadoras (SA4)</h2><p className="mt-0.5 text-xs font-medium text-slate-500">Importe o cadastro de transportadoras para facilitar a seleção no Recebimento. O CNPJ é a chave (evita duplicidade) e a operação nunca é restritiva.</p></div></div>
          <div className="mt-6">
            <label className="text-sm font-extrabold text-slate-800">Importar planilha da SA4</label>
            <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm font-bold text-slate-600 hover:border-slate-400 hover:text-slate-800">
              <FileUp className="h-5 w-5" />Selecionar arquivo .xlsx ou .csv
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void handleCarrierFile(file); event.currentTarget.value = ""; }} />
            </label>
            <p className="mt-2 text-xs font-semibold text-slate-500">Cabeçalhos reconhecidos: A4_COD / A4_NOME / A4_CGC (ou Código, Nome, CNPJ), além de Cidade e UF.</p>
            {carrierRows && (<div className="mt-4 rounded-2xl border border-slate-200 p-4"><p className="text-sm font-extrabold text-slate-800">{carrierRows.length} linha(s) lida(s) de “{carrierSourceFile}”.</p><p className="mt-1 text-xs font-semibold text-slate-500">Linhas com CNPJ igual serão atualizadas (não duplicadas). Linhas inválidas serão ignoradas com aviso.</p><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => { setCarrierRows(null); setCarrierSourceFile(""); }}>Cancelar</Button><Button disabled={importCarriers.isPending} onClick={() => importCarriers.mutate({ rows: carrierRows, sourceFileName: carrierSourceFile })}>{importCarriers.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}{importCarriers.isPending ? "Importando…" : "Importar"}</Button></div></div>)}
          </div>
          <div className="mt-6">
            <p className="text-sm font-extrabold text-slate-800">Cadastro ({carriers.data?.length ?? 0})</p>
            {carriers.isLoading ? <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando…</div> : carriers.data?.length ? <div className="mt-2 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-100">{carriers.data.map(carrier => <div key={carrier.id} className="px-4 py-3"><p className="text-sm font-bold text-slate-800">{carrier.name}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{carrier.code}{carrier.cnpj ? ` · CNPJ ${carrier.cnpj}` : ""}{carrier.city ? ` · ${carrier.city}${carrier.uf ? `/${carrier.uf}` : ""}` : ""}</p></div>)}</div> : <p className="mt-2 text-sm font-semibold text-slate-500">Nenhuma transportadora cadastrada ainda.</p>}
          </div>
        </section>}
      </div>
      {editingId && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h3 className="text-lg font-extrabold text-slate-950">Corrigir ponto de leitura</h3><p className="mt-1 text-xs font-semibold text-slate-500">Apenas o ponto de leitura pode ser alterado. A mudança fica registrada com seu usuário, data, hora e motivo.</p><div className="mt-4 grid gap-2 sm:grid-cols-4">{readingPoints.map(point => (<Button key={point} type="button" variant={editingPoint === point ? "default" : "outline"} onClick={() => setEditingPoint(point)} className={editingPoint === point ? "bg-slate-950 hover:bg-slate-800" : ""}>{readingPointLabels[point]}</Button>))}</div><label className="mt-4 block text-sm font-extrabold text-slate-800">Motivo da alteração</label><Input className="mt-1" placeholder="Descreva o motivo (obrigatório)" value={reason} onChange={event => setReason(event.target.value)} /><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button><Button disabled={updatePoint.isPending || !reason.trim()} onClick={() => updatePoint.mutate({ id: editingId, readingPoint: editingPoint, reason })}>{updatePoint.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}Salvar</Button></div></div></div>)}
      {removingId && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h3 className="text-lg font-extrabold text-slate-950">Remover leitura</h3><p className="mt-1 text-xs font-semibold text-slate-500">A leitura some da lista diária, mas o registro fica preservado com quem removeu, motivo, data e hora.</p><label className="mt-4 block text-sm font-extrabold text-slate-800">Motivo da exclusão</label><Input className="mt-1" placeholder="Descreva o motivo (obrigatório)" value={reason} onChange={event => setReason(event.target.value)} /><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setRemovingId(null)}>Cancelar</Button><Button disabled={removeReading.isPending || !reason.trim()} className="bg-rose-600 hover:bg-rose-700" onClick={() => removeReading.mutate({ id: removingId, reason })}>{removeReading.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}Remover</Button></div></div></div>)}
    </div>
  );
}