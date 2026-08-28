import { Button } from "@/components/ui/button";
import OneDriveImportSource from "@/components/OneDriveImportSource";
import { formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Archive, CheckCircle2, FileSpreadsheet, FileUp, Loader2, ShieldCheck, Upload } from "lucide-react";
import { ChangeEvent, FormEvent, useState } from "react";
import { toast } from "sonner";

async function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a planilha selecionada."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const contentBase64 = result.split(",")[1];
      if (!contentBase64) {
        reject(new Error("Não foi possível converter a planilha selecionada."));
        return;
      }
      resolve(contentBase64);
    };
    reader.readAsDataURL(file);
  });
}

export default function ImportData() {
  const utils = trpc.useUtils();
  const { data: imports = [] } = trpc.analytics.imports.useQuery();
  const { data: canAdminister = false } = trpc.analytics.canAdminister.useQuery();
  const [file, setFile] = useState<File | null>(null);
  const setImportStatus = trpc.analytics.setImportStatus.useMutation({
    onSuccess: async result => { await Promise.all([utils.analytics.imports.invalidate(), utils.analytics.dashboard.invalidate(), utils.analytics.filterOptions.invalidate()]); toast.success(result.status === "approved" ? "Versão aprovada para uso no painel." : "Versão arquivada."); },
    onError: error => toast.error(error.message),
  });
  const importWorkbook = trpc.analytics.importWorkbook.useMutation({
    onSuccess: async result => {
      await Promise.all([utils.analytics.imports.invalidate(), utils.analytics.dashboard.invalidate(), utils.analytics.filterOptions.invalidate()]);
      setFile(null);
      toast.success(`${result.versionName} criada com ${result.rowCount.toLocaleString("pt-BR")} registros. Aguardando aprovação do ADM para entrar no painel.`);
    },
    onError: error => toast.error(error.message),
  });

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (selected && !/^Compras - \d{12}\.xlsx$/i.test(selected.name)) {
      toast.error("O nome deve seguir o padrão Compras - aaaaMMddHHmm.xlsx.");
      event.target.value = "";
      return;
    }
    if (selected && !selected.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Selecione uma planilha no formato .xlsx.");
      event.target.value = "";
      return;
    }
    if (selected && selected.size > 18 * 1024 * 1024) {
      toast.error("A planilha deve ter no máximo 18 MB.");
      event.target.value = "";
      return;
    }
    setFile(selected);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return toast.error("Selecione a planilha extraída do Protheus.");
    importWorkbook.mutate({ fileName: file.name, contentBase64: await toBase64(file) });
  };

  return <div className="page-wrap max-w-5xl"><header className="mb-7"><p className="eyebrow">Fonte de dados</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl">Importar planilha</h1><p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-500">Envie cada versão da extração Excel do Protheus. A carga preserva o histórico, valida as colunas e permite analisar vendas, estoque, giro e MRP separadamente.</p></header>
    {canAdminister && <OneDriveImportSource />}
    <section className="sc-surface p-6 sm:p-8"><form onSubmit={submit}><div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center"><div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-[#dcebf7] text-slate-950"><FileSpreadsheet className="h-6 w-6" /></div><div className="flex-1"><p className="text-base font-extrabold tracking-tight text-slate-950">Planilha do Protheus</p><p className="mt-1 text-sm font-medium text-slate-500">Formato aceito: `Compras - aaaaMMddHHmm.xlsx` · Limite: 18 MB · Uma aba com a tabela de dados · MRP opcional (Sim/Não). O nome original é preservado e a data/hora dele define o histórico.</p></div></div><div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center"><label className="inline-flex h-10 max-w-xl cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:border-slate-400"><FileUp className="h-4 w-4" /><span>{file ? file.name : "Selecionar planilha"}</span><input aria-label="Selecionar planilha Excel" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={chooseFile} className="sr-only" /></label><Button type="submit" disabled={!file || importWorkbook.isPending} className="bg-slate-950 text-white hover:bg-slate-800">{importWorkbook.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{importWorkbook.isPending ? "Importando" : "Importar planilha"}</Button></div>{file && <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><CheckCircle2 className="h-4 w-4 text-emerald-700" />Arquivo selecionado e pronto para importação.</p>}</form></section>
    <section className="sc-surface mt-5 overflow-hidden"><div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-7"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f1ccd7] text-slate-950"><FileUp className="h-4 w-4" /></span><div><h2 className="text-base font-extrabold tracking-tight text-slate-950">Cargas realizadas</h2><p className="text-xs font-medium text-slate-500">Somente versões aprovadas pelo ADM entram no painel; as demais permanecem no histórico.</p></div></div><div className="divide-y divide-slate-100">{imports.length === 0 && <p className="px-5 py-10 text-center text-sm font-medium text-slate-500">Nenhuma planilha foi importada.</p>}{imports.map(item => <div className="flex flex-col gap-3 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-7" key={item.id}><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-950">{item.fileName}</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${item.status === "approved" ? "bg-emerald-100 text-emerald-800" : item.status === "archived" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800"}`}>{item.status === "approved" ? "Em uso" : item.status === "archived" ? "Arquivada" : "Pendente"}</span></div><p className="mt-1 font-medium text-slate-500">{item.rowCount.toLocaleString("pt-BR")} registros · Histórico: {formatDate(item.importedAt)}</p></div><div className="flex items-center gap-3"><p className="text-xs font-semibold text-slate-500">{item.status === "pending" ? "Aguardando ADM" : item.status === "approved" ? "Disponível no painel" : "Fora do painel"}</p>{canAdminister && item.status === "pending" && <Button variant="outline" size="sm" disabled={setImportStatus.isPending} onClick={() => setImportStatus.mutate({ importId: item.id, status: "approved" })}><ShieldCheck className="mr-2 h-3.5 w-3.5" />Aprovar uso</Button>}{canAdminister && item.status === "approved" && <Button variant="outline" size="sm" disabled={setImportStatus.isPending} onClick={() => setImportStatus.mutate({ importId: item.id, status: "archived" })}><Archive className="mr-2 h-3.5 w-3.5" />Arquivar</Button>}</div></div>)}</div></section>
  </div>;
}
