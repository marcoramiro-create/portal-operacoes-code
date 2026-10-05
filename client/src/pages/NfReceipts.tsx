import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { NfBarcodeScanner, detectPlatform } from "@/lib/nfBarcodeScanner";
import { formatNfNumber, formatNfReceiptExportRows } from "../../../shared/nfReceiptExport";
import { Barcode, Building2, Camera, CheckCircle2, ClipboardList, Download, FileUp, Keyboard, LoaderCircle, MapPin, PackageCheck, Pencil, ScanLine, Send, ShieldCheck, Trash2, Truck, Warehouse, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
type CaptureMethod = "manual" | "camera" | "barcode_reader";
type ReadingPoint = "descarga" | "recebimento" | "conferencia" | "envio_fiscal";
// 28/09/2026 — pontos de leitura com COR e SÍMBOLO para o operador identificar de imediato.
const readingPoints: ReadingPoint[] = ["recebimento", "descarga", "conferencia", "envio_fiscal"];
const readingPointMeta: Record<ReadingPoint, { label: string; icon: LucideIcon; selected: string; unselected: string; chip: string }> = {
  recebimento: { label: "Recebimento", icon: PackageCheck, selected: "border-emerald-600 bg-emerald-600 text-white shadow-sm", unselected: "border-slate-200 bg-white text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300", chip: "bg-emerald-50 text-emerald-700" },
  descarga: { label: "Descarga", icon: Truck, selected: "border-orange-500 bg-orange-500 text-white shadow-sm", unselected: "border-slate-200 bg-white text-orange-600 hover:bg-orange-50 hover:border-orange-300", chip: "bg-orange-50 text-orange-700" },
  conferencia: { label: "Conferência", icon: ClipboardList, selected: "border-amber-500 bg-amber-500 text-white shadow-sm", unselected: "border-slate-200 bg-white text-amber-600 hover:bg-amber-50 hover:border-amber-300", chip: "bg-amber-50 text-amber-700" },
  envio_fiscal: { label: "Envio ao fiscal", icon: Send, selected: "border-violet-600 bg-violet-600 text-white shadow-sm", unselected: "border-slate-200 bg-white text-violet-600 hover:bg-violet-50 hover:border-violet-300", chip: "bg-violet-50 text-violet-700" },
};
// 28/09/2026 — filiais do Mapa de Operações (planilha Mapa_de_Operacoes_Megatec).
// Valor gravado = "código + nome". Se preferir só o código, é 1 linha.
const FILIAIS = [
  "0101 Araçatuba", "0102 P Prudente", "0103 Agroterenas",
  "0106 Marilia", "0108 Andradina",
  "0301 Uberlandia", "0303 Rio Verde", "0304 Santa Vitória", "0305 Atvos Caçú",
  "0306 Itumbiara", "0307 Cerradinho",
];
const clean = (value: string) => value.replace(/\D/g, "").slice(0, 44);
const labels: Record<CaptureMethod, string> = { manual: "Digitação", camera: "Câmera", barcode_reader: "Leitor de mesa" };
// BLOCO 7: o modo Câmera se adapta ao SO — Android usa foto, iOS usa leitura ao vivo.
const isAndroid = detectPlatform() === "android";
const modeHelp: Record<CaptureMethod, string> = {
  manual: "Digite ou cole os 44 dígitos da chave de acesso.",
  barcode_reader: "Deixe o cursor no campo e faça a leitura; o leitor de mesa funciona como teclado.",
  camera: isAndroid
    ? "Toque em Fotografar e ler. A câmera do aparelho abre, você fotografa o código e a aplicação lê a foto."
    : "Aponte a câmera para o código de barras da DANFE. A leitura é feita automaticamente ao vivo.",
};
const cell = (value: unknown) => String(value ?? "").trim();
export default function NfReceipts() {
  const [accessKey, setAccessKey] = useState("");
  const [captureMethod, setCaptureMethod] = useState<CaptureMethod>("manual");
  const [readingPoint, setReadingPoint] = useState<ReadingPoint>("recebimento");
  const [activeView, setActiveView] = useState<"capture" | "history" | "carriers">("capture");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const liveContainerRef = useRef<HTMLDivElement>(null);
  const scanner = useMemo(() => new NfBarcodeScanner(), []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingPoint, setEditingPoint] = useState<ReadingPoint>("recebimento");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [carrierId, setCarrierId] = useState("");
  const [useManualCarrier, setUseManualCarrier] = useState(false);
  const [carrierManualName, setCarrierManualName] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  // 28/09/2026 — controle de filial/armazém/local na coleta (decisão do usuário).
  const [filial, setFilial] = useState("");
  const [armazem, setArmazem] = useState("");
  const [localEstoque, setLocalEstoque] = useState("");
  // 28/09/2026 — filtros do relatório (histórico e exportação).
  const [filterFilial, setFilterFilial] = useState("");
  const [filterArmazem, setFilterArmazem] = useState("");
  const [filterLocal, setFilterLocal] = useState("");
  const [carrierRows, setCarrierRows] = useState<{ code: string; name: string; cnpj: string; city: string; uf: string }[] | null>(null);
  const [carrierSourceFile, setCarrierSourceFile] = useState("");
  const recent = trpc.nfReceipts.recent.useQuery(undefined, { retry: false });
  const exportRows = trpc.nfReceipts.exportRows.useQuery(undefined, { enabled: false, retry: false });
  const carriers = trpc.carriers.list.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const capture = trpc.nfReceipts.capture.useMutation({
    onSuccess: data => { toast.success(`NF ${formatNfNumber(data.invoiceNumber)} registrada às ${new Date(data.capturedAt).toLocaleTimeString("pt-BR")}.`); utils.nfReceipts.recent.invalidate(); setAccessKey(""); setCarrierId(""); setUseManualCarrier(false); setCarrierManualName(""); setVehiclePlate(""); setFilial(""); setArmazem(""); setLocalEstoque(""); },
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
  // BLOCO 7: inicia/para a leitura ao vivo (iOS) quando o modo Câmera fica ativo.
  useEffect(() => {
    if (captureMethod !== "camera" || isAndroid || !liveContainerRef.current) return;
    setLiveBusy(true);
    setCameraError(null);
    scanner.start(liveContainerRef.current, key => {
      setAccessKey(key);
      setLiveBusy(false);
      toast.success("Código identificado. Revise a chave antes de registrar a NF.");
    }).catch(() => {
      setLiveBusy(false);
      setCameraError("Não foi possível abrir a câmera. Verifique a permissão e tente de novo.");
    });
    return () => { scanner.stop(); setLiveBusy(false); };
  }, [captureMethod, scanner]);
  const handlePhotoFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || photoBusy) return;
    setPhotoBusy(true);
    setCameraError(null);
    try {
      const key = await scanner.decodeFromFile(file);
      if (key) {
        setAccessKey(key);
        toast.success("Código de barras identificado. Revise a chave antes de registrar a NF.");
      } else {
        setCameraError("Não consegui ler o código na foto. Fotografe de novo, mais perto, sem reflexo e com boa iluminação.");
      }
    } finally {
      setPhotoBusy(false);
    }
  };
  const submit = () => {
    capture.mutate({
      accessKey,
      captureMethod,
      readingPoint,
      carrierId: !useManualCarrier && carrierId ? carrierId : null,
      carrierName: useManualCarrier && carrierManualName.trim() ? carrierManualName.trim() : null,
      vehiclePlate: vehiclePlate || null,
      filial: filial || null,
      armazem: armazem.trim() || null,
      localEstoque: localEstoque.trim() || null,
    });
  };
  const changeMode = (next: CaptureMethod) => { setCaptureMethod(next); setCameraError(null); };
  // 28/09/2026 — os MESMOS filtros valem para o histórico e para a exportação.
  const matchesFilters = (item: { filial?: string | null; armazem?: string | null; localEstoque?: string | null }) =>
    (!filterFilial || (item.filial ?? "") === filterFilial) &&
    (!filterArmazem || ((item.armazem ?? "").toLowerCase().includes(filterArmazem.toLowerCase()))) &&
    (!filterLocal || ((item.localEstoque ?? "").toLowerCase().includes(filterLocal.toLowerCase())));
  const filteredRecent = useMemo(() => (recent.data ?? []).filter(matchesFilters), [recent.data, filterFilial, filterArmazem, filterLocal]);
  const exportReadings = async () => {
    const response = await exportRows.refetch();
    if (response.error) { toast.error(response.error.message); return; }
    const rows = (response.data ?? []).filter(matchesFilters);
    if (!rows.length) { toast.error("Ainda não há leituras para exportar com os filtros atuais."); return; }
    const base = formatNfReceiptExportRows(rows);
    const enriched = base.map((row, i) => ({ ...(typeof row === "object" && row !== null ? row : {}), Filial: rows[i]?.filial ?? "", "Armazém": rows[i]?.armazem ?? "", "Local de estoque": rows[i]?.localEstoque ?? "" }));
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(enriched);
    worksheet["!cols"] = [{ wch: 48 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 16 }];
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
        <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-500">Registre a chave de acesso da NF apontando onde você está lendo e para onde vai a mercadoria. A mesma NF pode passar por vários pontos de leitura. Usuários com permissão de administrador podem corrigir o ponto ou remover leituras, sempre com motivo e registro de auditoria.</p>
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
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1ccd7] text-slate-950"><ScanLine className="h-5 w-5" /></span><div><h2 className="text-lg font-extrabold tracking-tight text-slate-950">Capturar chave de acesso</h2><p className="mt-0.5 text-xs font-medium text-slate-500">1· Onde você está lendo? 2· Para onde vai a mercadoria? 3· Como captura? 4· Registre.</p></div></div>
          {/* 1º — PONTO DE LEITURA (cor + símbolo) */}
          <div className="mt-6"><label className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800"><MapPin className="h-4 w-4" /> Ponto de leitura</label><div className="mt-2 grid gap-2 sm:grid-cols-4">{readingPoints.map(point => { const meta = readingPointMeta[point]; const Icon = meta.icon; return (<Button key={point} type="button" variant="outline" onClick={() => setReadingPoint(point)} className={`justify-start border ${readingPoint === point ? meta.selected : meta.unselected}`}><Icon className="mr-2 h-4 w-4" />{meta.label}</Button>); })}</div><p className="mt-3 text-xs font-semibold text-slate-500">A mesma NF pode ser lida em vários pontos (Recebimento, Descarga, Conferência, Envio ao fiscal).</p></div>
          {/* 2º — DESTINO: filial (lista) + armazém + local (texto livre, cadastros futuros) */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800"><Building2 className="h-4 w-4" /> Para onde vai a mercadoria</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div><label className="text-xs font-extrabold text-slate-700">Filial *</label><select className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800" value={filial} onChange={event => setFilial(event.target.value)}><option value="">Selecione a filial</option>{FILIAIS.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
              <div><label className="text-xs font-extrabold text-slate-700">Armazém</label><Input className="mt-1" placeholder="Ex.: 01-DISPONIVEL" value={armazem} onChange={event => setArmazem(event.target.value)} /></div>
              <div><label className="text-xs font-extrabold text-slate-700">Local de estoque</label><Input className="mt-1" placeholder="Ex.: SP" value={localEstoque} onChange={event => setLocalEstoque(event.target.value)} /></div>
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500">A filial é obrigatória para o controle das consultas a vendedores e gestão.</p>
          </div>
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
          {/* 3º — MODO DE CAPTURA (com o leitor logo abaixo) */}
          <div className="mt-6"><label className="text-sm font-extrabold text-slate-800">Modo de captura</label><div className="mt-2 grid gap-2 sm:grid-cols-3">{(["manual", "barcode_reader", "camera"] as CaptureMethod[]).map(mode => (<Button key={mode} type="button" variant={captureMethod === mode ? "default" : "outline"} onClick={() => changeMode(mode)} className={captureMethod === mode ? "bg-slate-950 hover:bg-slate-800" : ""}>{mode === "manual" ? <Keyboard className="mr-2 h-4 w-4" /> : mode === "barcode_reader" ? <Barcode className="mr-2 h-4 w-4" /> : <Camera className="mr-2 h-4 w-4" />}{labels[mode]}</Button>))}</div><p className="mt-3 text-xs font-semibold text-slate-500">{modeHelp[captureMethod]}</p></div>
          {captureMethod === "camera" && (<div className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-extrabold text-slate-800">Leitor de código pela câmera</p><p className="mt-1 text-xs font-semibold text-slate-500">{modeHelp.camera}</p></div></div>
            {isAndroid ? (
              <>
                <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoFile} />
                <div className="mt-4 flex flex-wrap items-center gap-3"><Button onClick={() => photoInputRef.current?.click()} disabled={photoBusy}>{photoBusy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}{photoBusy ? "Lendo foto…" : "Fotografar e ler"}</Button></div>
              </>
            ) : (
              <div className="mt-4">
                <div ref={liveContainerRef} className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black" />
                {liveBusy && <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Aguardando o código…</p>}
              </div>
            )}
            {cameraError && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{cameraError}</p>}
          </div>)}
          {/* 4º — CHAVE + REGISTRAR (fixo no rodapé, sempre visível — o sucesso aparece acima/nos toasts) */}
          <div className="sticky bottom-0 z-10 -mx-5 -mb-5 mt-6 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:-mx-7 sm:-mb-7 sm:px-7 sm:py-5"><label className="text-sm font-extrabold text-slate-800">Chave de acesso da NF</label><div className="mt-2 flex gap-2"><Input autoFocus inputMode="numeric" placeholder="44 dígitos da chave de acesso" value={accessKey} onChange={event => setAccessKey(clean(event.target.value))} onKeyDown={event => { if (event.key === "Enter" && accessKey.length === 44 && filial) submit(); }} /><Button disabled={capture.isPending || accessKey.length !== 44 || !filial} className="bg-slate-950 hover:bg-slate-800" onClick={submit}>{capture.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Registrar NF</Button></div><p className="mt-1.5 text-xs font-semibold text-slate-500">{!filial ? "Selecione a filial para habilitar o registro." : `${accessKey.length}/44 dígitos`}</p></div>
        </section>}
        {activeView === "history" && <section className="sc-surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-7"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d8ebfa] text-slate-950"><ShieldCheck className="h-5 w-5" /></span><div><h2 className="text-lg font-extrabold tracking-tight text-slate-950">Últimas leituras</h2><p className="mt-0.5 text-xs font-medium text-slate-500">Registro auditável com usuário, ponto, data, filial, armazém e local de estoque.</p></div></div><Button size="sm" variant="outline" onClick={() => void exportReadings()} disabled={exportRows.isFetching}><Download className="mr-2 h-4 w-4" />{exportRows.isFetching ? "Preparando…" : "Exportar Excel"}</Button></div>
          <div className="grid gap-2 border-b border-slate-100 px-5 py-3 sm:grid-cols-3 sm:px-7">
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800" value={filterFilial} onChange={event => setFilterFilial(event.target.value)}><option value="">Filial: todas</option>{FILIAIS.map(f => <option key={f} value={f}>{f}</option>)}</select>
            <Input placeholder="Filtrar armazém…" value={filterArmazem} onChange={event => setFilterArmazem(event.target.value)} />
            <Input placeholder="Filtrar local de estoque…" value={filterLocal} onChange={event => setFilterLocal(event.target.value)} />
          </div>
          {recent.isLoading ? <div className="flex items-center gap-2 p-7 text-sm font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando leituras…</div> : filteredRecent.length ? <div className="divide-y divide-slate-100">{filteredRecent.map(item => <div className="px-5 py-4 sm:px-7" key={item.id}><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold tracking-[0.08em] text-slate-800">{item.accessKey}</p><p className="mt-1 text-xs font-semibold text-slate-500">NF {formatNfNumber(item.invoiceNumber)} · Série {item.invoiceSeries} · CNPJ {item.issuerCnpj}</p>{item.supplier ? <p className="mt-1 text-xs font-bold text-slate-700">Fornecedor: {item.supplier.tradeName || item.supplier.legalName} · Código {item.supplier.code} · Loja {item.supplier.store}</p> : <p className="mt-1 text-xs font-semibold text-amber-700">Fornecedor não identificado no cadastro ativo.</p>}{item.carrierName ? <p className="mt-1 text-xs font-semibold text-slate-600">Transportadora: {item.carrierName}{item.vehiclePlate ? ` · Placa ${item.vehiclePlate}` : ""}</p> : null}</div><div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-600">{labels[item.captureMethod]}</span><Button size="sm" variant="ghost" onClick={() => { setEditingId(item.id); setEditingPoint(item.readingPoint); setReason(""); }} title="Corrigir ponto de leitura"><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={() => { setRemovingId(item.id); setReason(""); }} title="Remover leitura"><Trash2 className="h-4 w-4 text-rose-600" /></Button></div></div><div className="mt-2 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${readingPointMeta[item.readingPoint]?.chip ?? "bg-slate-100 text-slate-600"}`}>Ponto: {readingPointMeta[item.readingPoint]?.label ?? "—"}</span>{item.filial ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-600">Filial: {item.filial}</span> : null}{item.armazem ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-600">Arm.: {item.armazem}</span> : null}{item.localEstoque ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-600">Local: {item.localEstoque}</span> : null}<span className="text-xs font-semibold text-slate-500">{new Date(item.capturedAt).toLocaleString("pt-BR")} · {item.capturedBy ?? "Usuário do portal"}</span></div></div>)}</div> : <div className="p-7 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-500">{recent.data?.length ? "Nenhuma leitura encontrada com os filtros atuais." : "Nenhuma chave foi registrada ainda."}</p></div>}
          {recent.data && recent.data.length > 0 && filteredRecent.length !== recent.data.length && <div className="border-t border-slate-100 px-5 py-2 text-xs font-semibold text-slate-500">Mostrando {filteredRecent.length} de {recent.data.length} leituras com os filtros atuais.</div>}
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
      {editingId && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h3 className="text-lg font-extrabold text-slate-950">Corrigir ponto de leitura</h3><p className="mt-1 text-xs font-semibold text-slate-500">Apenas o ponto de leitura pode ser alterado. A mudança fica registrada com seu usuário, data, hora e motivo.</p><div className="mt-4 grid gap-2 sm:grid-cols-4">{readingPoints.map(point => { const meta = readingPointMeta[point]; const Icon = meta.icon; return (<Button key={point} type="button" variant="outline" onClick={() => setEditingPoint(point)} className={`justify-start border ${editingPoint === point ? meta.selected : meta.unselected}`}><Icon className="mr-2 h-4 w-4" />{meta.label}</Button>); })}</div><label className="mt-4 block text-sm font-extrabold text-slate-800">Motivo da alteração</label><Input className="mt-1" placeholder="Descreva o motivo (obrigatório)" value={reason} onChange={event => setReason(event.target.value)} /><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button><Button disabled={updatePoint.isPending || !reason.trim()} onClick={() => updatePoint.mutate({ id: editingId, readingPoint: editingPoint, reason })}>{updatePoint.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}Salvar</Button></div></div></div>)}
      {removingId && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h3 className="text-lg font-extrabold text-slate-950">Remover leitura</h3><p className="mt-1 text-xs font-semibold text-slate-500">A leitura some da lista diária, mas o registro fica preservado com quem removeu, motivo, data e hora.</p><label className="mt-4 block text-sm font-extrabold text-slate-800">Motivo da exclusão</label><Input className="mt-1" placeholder="Descreva o motivo (obrigatório)" value={reason} onChange={event => setReason(event.target.value)} /><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setRemovingId(null)}>Cancelar</Button><Button disabled={removeReading.isPending || !reason.trim()} className="bg-rose-600 hover:bg-rose-700" onClick={() => removeReading.mutate({ id: removingId, reason })}>{removeReading.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}Remover</Button></div></div></div>)}
    </div>
  );
}