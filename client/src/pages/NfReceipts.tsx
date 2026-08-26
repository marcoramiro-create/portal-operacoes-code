import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { BarcodeFormat, BrowserMultiFormatReader } from "@zxing/browser";
import { Barcode, Camera, CheckCircle2, ImageUp, Keyboard, LoaderCircle, ScanLine, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
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
  camera: "A câmera do celular abre no modo foto para ler código de barras ou QR Code. A foto não é guardada no portal.",
};
const supportedFormats = [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
];

export default function NfReceipts() {
  const [accessKey, setAccessKey] = useState("");
  const [captureMethod, setCaptureMethod] = useState<CaptureMethod>("manual");
  const [cameraScanning, setCameraScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const recent = trpc.nfReceipts.recent.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const capture = trpc.nfReceipts.capture.useMutation({
    onSuccess: data => {
      toast.success(`NF registrada às ${new Date(data.capturedAt).toLocaleTimeString("pt-BR")}.`);
      utils.nfReceipts.recent.invalidate();
      setAccessKey("");
    },
    onError: error => toast.error(error.message),
  });

  const submit = () => capture.mutate({ accessKey, captureMethod });
  const openCamera = () => imageInputRef.current?.click();
  const changeMode = (next: CaptureMethod) => {
    setCaptureMethod(next);
    setCameraError(null);
    if (next === "camera") openCamera();
  };
  const decodePhoto = async (file: File) => {
    setCameraScanning(true);
    setCameraError(null);
    const photoUrl = URL.createObjectURL(file);
    try {
      const reader = readerRef.current ?? new BrowserMultiFormatReader();
      readerRef.current = reader;
      reader.possibleFormats = supportedFormats;
      const result = await reader.decodeFromImageUrl(photoUrl);
      setAccessKey(clean(result.getText()));
      toast.success("Código identificado. Revise a chave antes de registrar a NF.");
    } catch {
      setCameraError("Não foi possível identificar um código de barras ou QR Code nesta foto. Aproxime o código, mantenha boa iluminação e tente novamente.");
    } finally {
      URL.revokeObjectURL(photoUrl);
      setCameraScanning(false);
    }
  };
  const onPhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void decodePhoto(file);
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
          <input ref={imageInputRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={onPhotoChange} />
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
                  <p className="text-sm font-extrabold text-slate-800">Fotografar código</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">A foto é analisada somente no dispositivo para preencher a chave e não é salva.</p>
                </div>
                <Button variant="outline" onClick={openCamera} disabled={cameraScanning}><ImageUp className="mr-2 h-4 w-4" />Fotografar novamente</Button>
              </div>
              {cameraScanning && <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Lendo o código da foto…</p>}
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
