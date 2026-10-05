import OneDriveImportSource from "@/components/OneDriveImportSource";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { LoaderCircle, Search, UploadCloud } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// Lê o arquivo em base64 (mesmo padrão do CostEvolution / ImportData).
async function fileAsBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 32_768;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...Array.from(bytes.subarray(index, index + chunk)));
  return btoa(binary);
}

// Formata data ISO (YYYY-MM-DD) para dd/mm/aaaa, em UTC (não desloca o dia).
const dateOnly = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

export default function MaterialEntryImport() {
  const [file, setFile] = useState<File | null>(null);
  const [contentBase64, setContentBase64] = useState("");
  const preview = trpc.operationalImport.previewMaterialEntries.useMutation({ onError: error => toast.error(error.message) });
  const commit = trpc.operationalImport.importMaterialEntries.useMutation({
    onSuccess: result => {
      toast.success(`${result.rowCount.toLocaleString("pt-BR")} registros de entrada de materiais gravados em novo lote (${result.status}).`);
      setFile(null);
      setContentBase64("");
      preview.reset();
    },
    onError: error => toast.error(error.message),
  });
  const chooseFile = async (selected: File | null) => {
    preview.reset();
    setFile(null);
    setContentBase64("");
    if (!selected) return;
    if (!/\.xlsx$/i.test(selected.name)) return toast.error("Selecione uma planilha .xlsx exportada do RM BIS (Entrada de Materiais).");
    if (selected.size > 10 * 1024 * 1024) return toast.error("O arquivo deve ter no máximo 10 MB.");
    setFile(selected);
    setContentBase64(await fileAsBase64(selected));
  };
  const data = preview.data;
  return (
    <div className="page-wrap">
      <header className="mb-7">
        <p className="eyebrow">Importações · Indústria · Entrada de materiais</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl">Importar entrada de materiais</h1>
        <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-500">Use a planilha original do RM BIS (cubo de Entrada de Materiais). O portal normaliza a filial, os códigos e as datas sem alterar valores, e registra a carga no histórico com bloqueio de arquivo duplicado.</p>
      </header>
      <OneDriveImportSource />
      <section className="sc-surface p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-lg font-extrabold text-slate-950">1. Selecionar e conferir</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-500">A confirmação somente é liberada após a prévia identificar as colunas obrigatórias: EMPRESA - FILIAL, NOTA/SERIE, PRODUTO, QUANTIDADE e DATA ENTRADA.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input type="file" accept=".xlsx" onChange={event => chooseFile(event.target.files?.[0] ?? null)} />
            <Button disabled={!file || !contentBase64 || preview.isPending} onClick={() => file && preview.mutate({ fileName: file.name, contentBase64 })} className="bg-slate-950 hover:bg-slate-800">
              {preview.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Analisar planilha
            </Button>
          </div>
        </div>
        {file && <p className="mt-4 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Arquivo: {file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
      </section>
      {data && (
        <section className="sc-surface mt-5 overflow-hidden">
          <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-5 sm:p-7">
            {[["Registros de origem", data.sourceRows.toLocaleString("pt-BR")], ["Válidos", data.validRows.toLocaleString("pt-BR")], ["Ignorados", data.skippedRows.toLocaleString("pt-BR")], ["Problemas", (data.issues?.length ?? 0).toLocaleString("pt-BR")], ["Amostra exibida", (data.sampleRows?.length ?? 0).toLocaleString("pt-BR")]].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</p>
                <p className="mt-2 text-base font-extrabold text-slate-950">{value}</p>
              </div>
            ))}
          </div>
          {data.issues && data.issues.length > 0 && (
            <div className="border-b border-rose-100 bg-rose-50 p-5 text-sm font-semibold text-rose-800">A carga possui problemas. Primeiros registros: {data.issues.slice(0, 5).map(issue => `Linha ${issue.row}: ${issue.message}`).join(" · ")}</div>
          )}
          {data.sampleRows && data.sampleRows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filial</TableHead>
                  <TableHead>Nota/Série</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Valor item</TableHead>
                  <TableHead>Data entrada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sampleRows.slice(0, 10).map((row: any, index: number) => (
                  <TableRow key={`${row.key}-${index}`}>
                    <TableCell>{row.branch ?? row.company}</TableCell>
                    <TableCell>{row.invoiceSeries || "—"}</TableCell>
                    <TableCell>
                      <p className="font-bold text-slate-950">{row.productCode}</p>
                      <p className="text-xs text-slate-500">Agregado {row.aggregateProductCode || "—"}</p>
                    </TableCell>
                    <TableCell className="max-w-sm">{row.description || "—"}</TableCell>
                    <TableCell className="text-right">{row.quantity != null ? number.format(row.quantity) : "—"}</TableCell>
                    <TableCell className="text-right">{row.itemValue != null ? money.format(row.itemValue) : "—"}</TableCell>
                    <TableCell>{dateOnly(row.entryDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="flex flex-col justify-between gap-3 border-t border-slate-100 p-5 sm:flex-row sm:items-center sm:p-7">
            <p className="text-sm font-semibold text-slate-600">A carga será gravada no histórico do portal. Arquivos idênticos já importados são bloqueados automaticamente.</p>
            <Button disabled={!data.validRows || commit.isPending} onClick={() => file && commit.mutate({ fileName: file.name, contentBase64 })} className="bg-emerald-700 hover:bg-emerald-800">
              {commit.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}Confirmar importação
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}