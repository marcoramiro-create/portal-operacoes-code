import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { Barcode, Camera, CheckCircle2, Keyboard, LoaderCircle, ScanLine, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type CaptureMethod = "manual" | "camera" | "barcode_reader";
const clean = (value: string) => value.replace(/\D/g, "").slice(0, 44);
const labels: Record<CaptureMethod, string> = { manual: "Digitação", camera: "Câmera", barcode_reader: "Leitor de mesa" };

export default function NfReceipts() {
  const [manual, setManual] = useState("");
  const [readerValue, setReaderValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const recent = trpc.nfReceipts.recent.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const capture = trpc.nfReceipts.capture.useMutation({ onSuccess: data => { toast.success(`NF registrada às ${new Date(data.capturedAt).toLocaleTimeString("pt-BR")}.`); utils.nfReceipts.recent.invalidate(); setManual(""); setReaderValue(""); stopCamera(); }, onError: error => toast.error(error.message) });

  const stopCamera = () => { controlsRef.current?.stop(); controlsRef.current = null; setCameraOpen(false); };
  useEffect(() => () => controlsRef.current?.stop(), []);
  const submit = (value: string, captureMethod: CaptureMethod) => capture.mutate({ accessKey: clean(value), captureMethod });
  const startCamera = async () => {
    setCameraError(null); setCameraOpen(true);
    try {
      const reader = readerRef.current ?? new BrowserMultiFormatReader(); readerRef.current = reader;
      if (!videoRef.current) return;
      controlsRef.current = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, videoRef.current, result => { if (result) submit(result.getText(), "camera"); });
    } catch {
      setCameraOpen(false); setCameraError("Não foi possível acessar a câmera. Confirme a permissão do navegador e tente novamente.");
    }
  };
  return <div className="page-wrap"><header className="mb-7"><p className="eyebrow">Recebimentos · Nota fiscal</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl">Recebimento simples de NF</h1><p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-500">Registre a chave de acesso da NF. O portal grava automaticamente o usuário autenticado, a data e a hora da leitura, além de preparar campos para cruzamento futuro com SC7 e NF Legal.</p></header><div className="grid gap-5 xl:grid-cols-[1.06fr_.94fr]"><section className="sc-surface p-5 sm:p-7"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1ccd7] text-slate-950"><ScanLine className="h-5 w-5" /></span><div><h2 className="text-lg font-extrabold tracking-tight text-slate-950">Capturar chave de acesso</h2><p className="mt-0.5 text-xs font-medium text-slate-500">São aceitos somente os 44 dígitos numéricos da chave.</p></div></div><div className="mt-6 space-y-5"><div><label className="text-sm font-extrabold text-slate-800">Digitação manual</label><div className="mt-2 flex gap-2"><Input inputMode="numeric" placeholder="44 dígitos da chave de acesso" value={manual} onChange={event => setManual(clean(event.target.value))} onKeyDown={event => { if (event.key === "Enter" && manual.length === 44) submit(manual, "manual"); }} /><Button disabled={capture.isPending || manual.length !== 44} className="bg-slate-950 hover:bg-slate-800" onClick={() => submit(manual, "manual")}><Keyboard className="mr-2 h-4 w-4" />Registrar</Button></div><p className="mt-1.5 text-xs font-semibold text-slate-500">{manual.length}/44 dígitos</p></div><div className="border-t border-slate-100 pt-5"><label className="text-sm font-extrabold text-slate-800">Leitor de código de barras de mesa</label><div className="mt-2 flex gap-2"><Input inputMode="numeric" placeholder="Clique aqui e leia; o leitor preenche este campo" value={readerValue} onChange={event => setReaderValue(clean(event.target.value))} onKeyDown={event => { if (event.key === "Enter" && readerValue.length === 44) submit(readerValue, "barcode_reader"); }} /><Button variant="outline" disabled={capture.isPending || readerValue.length !== 44} onClick={() => submit(readerValue, "barcode_reader")}><Barcode className="mr-2 h-4 w-4" />Ler</Button></div><p className="mt-1.5 text-xs font-semibold text-slate-500">A maioria dos leitores funciona como teclado: aponte para o código e aguarde o Enter automático.</p></div><div className="border-t border-slate-100 pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><label className="text-sm font-extrabold text-slate-800">Câmera do celular</label><p className="mt-1 text-xs font-semibold text-slate-500">Use a câmera traseira para ler o código de barras da DANFE.</p></div>{cameraOpen ? <Button variant="outline" onClick={stopCamera}><X className="mr-2 h-4 w-4" />Encerrar câmera</Button> : <Button variant="outline" onClick={startCamera}><Camera className="mr-2 h-4 w-4" />Abrir câmera</Button>}</div>{cameraOpen && <video ref={videoRef} className="mt-4 aspect-video w-full rounded-xl bg-slate-950 object-cover" muted playsInline />}{cameraError && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{cameraError}</p>}</div></div></section><section className="sc-surface overflow-hidden"><div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-7"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d8ebfa] text-slate-950"><ShieldCheck className="h-5 w-5" /></span><div><h2 className="text-lg font-extrabold tracking-tight text-slate-950">Últimas leituras</h2><p className="mt-0.5 text-xs font-medium text-slate-500">Registro auditável com usuário, data e hora.</p></div></div>{recent.isLoading ? <div className="flex items-center gap-2 p-7 text-sm font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando leituras…</div> : recent.data?.length ? <div className="divide-y divide-slate-100">{recent.data.map(item => <div className="px-5 py-4 sm:px-7" key={item.id}><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold tracking-[0.08em] text-slate-800">{item.accessKey}</p><p className="mt-1 text-xs font-semibold text-slate-500">NF {Number(item.invoiceNumber)} · Série {Number(item.invoiceSeries)} · CNPJ {item.issuerCnpj}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-600">{labels[item.captureMethod]}</span></div><p className="mt-2 text-xs font-semibold text-slate-500">{new Date(item.capturedAt).toLocaleString("pt-BR")} · {item.capturedBy ?? "Usuário do portal"}</p></div>)}</div> : <div className="p-7 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-500">Nenhuma chave foi registrada ainda.</p></div>}</section></div></div>;
}
