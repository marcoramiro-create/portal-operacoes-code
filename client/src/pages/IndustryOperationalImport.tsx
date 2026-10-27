import OneDriveImportSource from "@/components/OneDriveImportSource";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, LoaderCircle, Search, UploadCloud } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

async function fileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.split(",", 2)[1] ?? "");
    };
    reader.readAsDataURL(file);
  });
}

type Mode = "stock" | "entries";
const config = {
  stock: { eyebrow: "Importações · Indústria · Estoque", title: "Importar evolução de estoque", description: "Carregue o fechamento mensal do estoque. Após a gravação, o portal tenta recalcular automaticamente a Curva ABC da Indústria.", preview: "previewStockEvolution", commit: "importStockEvolution", accept: ".xlsx,.csv" },
  entries: { eyebrow: "Importações · Indústria · Entradas", title: "Importar entradas de estoque", description: "Carregue as entradas de materiais do RM BIS. Esta fonte compõe a Curva ABC da Indústria junto com o fechamento de estoque.", preview: "previewMaterialEntries", commit: "importMaterialEntries", accept: ".xlsx" },
} as const;

export default function IndustryOperationalImport({ mode }: { mode: Mode }) {
  const details = config[mode];
  const [file, setFile] = useState<File | null>(null);
  const [contentBase64, setContentBase64] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const previewMutation = trpc.operationalImport[details.preview].useMutation({
    onSuccess: result => { setPreview(result); toast.success("Prévia gerada sem gravar dados."); },
    onError: error => toast.error(error.message),
  });
  const commitMutation = trpc.operationalImport[details.commit].useMutation({
    onSuccess: (result: any) => { toast.success(result.curva?.message ?? `${result.rowCount?.toLocaleString("pt-BR") ?? "Carga"} registros gravados.`); setFile(null); setContentBase64(""); setPreview(null); previewMutation.reset(); },
    onError: error => toast.error(error.message),
  });
  const chooseFile = async (selected: File | null) => { setFile(null); setContentBase64(""); setPreview(null); previewMutation.reset(); if (!selected) return; setFile(selected); setContentBase64(await fileAsBase64(selected)); };
  const analyze = () => { if (file && contentBase64) previewMutation.mutate({ fileName: file.name, contentBase64 }); };
  const commit = () => { if (file && contentBase64 && preview?.validRows) commitMutation.mutate({ fileName: file.name, contentBase64 }); };
  return <div className="page-wrap max-w-6xl">
    <header className="mb-7"><p className="eyebrow">{details.eyebrow}</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl">{details.title}</h1><p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-500">{details.description}</p></header>
    <OneDriveImportSource />
    <section className="sc-surface p-5 sm:p-7"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-lg font-extrabold text-slate-950">1. Selecionar e analisar</h2><p className="mt-2 text-sm font-medium text-slate-500">A prévia valida os cabeçalhos antes de gravar qualquer dado.</p></div><div className="flex flex-col gap-2 sm:flex-row"><Input type="file" accept={details.accept} onChange={event => chooseFile(event.target.files?.[0] ?? null)} /><Button disabled={!file || !contentBase64 || previewMutation.isPending} onClick={analyze} className="bg-slate-950 hover:bg-slate-800">{previewMutation.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Analisar arquivo</Button></div></div>{file && <p className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-700" />{file.name}</p>}</section>
    {preview && <section className="sc-surface mt-5 p-5 sm:p-7"><div className="grid gap-3 sm:grid-cols-4">{[["Origem", preview.sourceRows], ["Válidos", preview.validRows], ["Ignorados", preview.skippedRows], ["Problemas", preview.issues?.length ?? 0]].map(([label, value]) => <div className="rounded-2xl bg-slate-50 p-4" key={label as string}><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-xl font-extrabold text-slate-950">{Number(value).toLocaleString("pt-BR")}</p></div>)}</div>{preview.issues?.length > 0 && <div className="mt-4 rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-800">{preview.issues.slice(0, 5).map((issue: any) => <p key={`${issue.row}-${issue.message}`}>Linha {issue.row}: {issue.message}</p>)}</div>}<div className="mt-5 flex flex-col justify-between gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center"><p className="text-sm font-semibold text-slate-600">A gravação cria um lote auditável. Arquivo duplicado será bloqueado.</p><Button disabled={!preview.validRows || preview.issues?.length > 0 || commitMutation.isPending} onClick={commit} className="bg-emerald-700 hover:bg-emerald-800">{commitMutation.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}Confirmar importação</Button></div></section>}
  </div>;
}
