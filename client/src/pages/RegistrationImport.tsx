import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { registrationLayouts, RegistrationType } from "../../../shared/registrationLayouts";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { ChangeEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export default function RegistrationImport({ type }: { type: RegistrationType }) {
  const layout = registrationLayouts[type];
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [clientErrors, setClientErrors] = useState<string[]>([]);
  const previewImport = trpc.cadastros.previewImport.useMutation();
  const commitImport = trpc.cadastros.commitImport.useMutation({ onSuccess: result => { toast.success(`${result.importedRows} linha(s) importada(s) com sucesso.`); setRows([]); setFileName(""); previewImport.reset(); }, onError: error => toast.error(error.message) });
  const preview = previewImport.data;
  const canCommit = Boolean(preview?.valid && rows.length && !commitImport.isPending);
  const headers = useMemo(() => layout.columns.map(column => column.key), [layout]);

  const downloadLayout = () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    worksheet["!cols"] = layout.columns.map(column => ({ wch: Math.max(column.label.length + 4, 22) }));
    worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    const instructions = XLSX.utils.aoa_to_sheet([["Coluna", "Obrigatório", "Orientação"], ...layout.columns.map(column => [column.key, column.required ? "SIM" : "NÃO", column.hint])]);
    instructions["!cols"] = [{ wch: 26 }, { wch: 14 }, { wch: 78 }];
    XLSX.utils.book_append_sheet(workbook, worksheet, layout.sheetName);
    XLSX.utils.book_append_sheet(workbook, instructions, "Instruções");
    XLSX.writeFile(workbook, `${layout.fileName}.xlsx`);
  };

  const readSpreadsheet = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const worksheet = workbook.Sheets[layout.sheetName] ?? workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) throw new Error("Nenhuma aba foi encontrada na planilha.");
      const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: false });
      const actualHeaders = Object.keys(sourceRows[0] ?? {}).map(header => header.trim());
      const missing = headers.filter(header => !actualHeaders.includes(header));
      if (missing.length) { setRows([]); setFileName(""); setClientErrors([`Colunas ausentes: ${missing.join(", ")}. Baixe e use o leiaute deste cadastro.`]); return; }
      const normalized = sourceRows.map(row => Object.fromEntries(headers.map(header => [header, String(row[header] ?? "").trim()])));
      if (!normalized.length) throw new Error("A primeira aba não contém linhas de dados para importar.");
      if (normalized.length > 500) throw new Error("Importe no máximo 500 linhas por vez.");
      setRows(normalized); setFileName(file.name); setClientErrors([]); previewImport.reset();
      toast.success(`${normalized.length} linha(s) carregada(s). Valide antes de importar.`);
    } catch (error) { setRows([]); setFileName(""); setClientErrors([error instanceof Error ? error.message : "Não foi possível ler a planilha."]); }
  };

  return <div className="page-wrap"><header className="mb-7"><p className="eyebrow">Cadastros · Planilhas</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl">{layout.label}</h1><p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-500">{layout.description} Primeiro baixe o leiaute, preencha a primeira aba sem renomear as colunas e valide o arquivo antes de gravar os dados.</p></header>
    <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"><div className="sc-surface p-6"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dcebf7] text-slate-950"><Download className="h-5 w-5" /></span><h2 className="mt-4 text-lg font-extrabold tracking-tight text-slate-950">1. Baixe o leiaute</h2><p className="mt-2 text-sm font-medium leading-6 text-slate-500">O arquivo contém uma aba para preenchimento e outra com a explicação de cada coluna.</p><Button className="mt-5 w-full bg-slate-950 text-white hover:bg-slate-800" onClick={downloadLayout}><FileSpreadsheet className="mr-2 h-4 w-4" />Baixar leiaute Excel</Button><div className="mt-5 border-t border-slate-100 pt-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Campos obrigatórios</p><div className="mt-2 flex flex-wrap gap-2">{layout.columns.filter(column => column.required).map(column => <span key={column.key} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{column.label}</span>)}</div></div></div>
      <div className="sc-surface p-6"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1ccd7] text-slate-950"><Upload className="h-5 w-5" /></span><h2 className="mt-4 text-lg font-extrabold tracking-tight text-slate-950">2. Envie e valide</h2><p className="mt-2 text-sm font-medium leading-6 text-slate-500">A importação só será liberada se todos os dados obrigatórios e referências estiverem corretos.</p><Label htmlFor={`file-${type}`} className="mt-5 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm font-bold text-slate-700 hover:border-slate-500"><Upload className="mb-2 h-5 w-5" />{fileName ? fileName : "Clique para selecionar uma planilha .xlsx ou .xls"}<Input id={`file-${type}`} className="sr-only" type="file" accept=".xlsx,.xls" onChange={readSpreadsheet} /></Label>{rows.length > 0 && <p className="mt-3 text-xs font-semibold text-slate-500">{rows.length} linha(s) carregada(s). Clique em “Validar planilha” antes de importar.</p>}<Button className="mt-5 w-full" variant="outline" disabled={!rows.length || previewImport.isPending} onClick={() => previewImport.mutate({ type, rows })}>{previewImport.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Validar planilha</Button></div></section>
    {(clientErrors.length > 0 || preview) && <section className="sc-surface mt-5 p-6"><div className="flex items-center gap-3"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${preview?.valid ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{preview?.valid ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}</span><div><h2 className="text-base font-extrabold text-slate-950">Resultado da validação</h2><p className="text-sm font-medium text-slate-500">{preview?.valid ? `${preview.totalRows} linha(s) pronta(s) para importação.` : "Corrija os pontos indicados antes de gravar."}</p></div></div>{(clientErrors.length > 0 || preview?.issues.length) ? <div className="mt-5 overflow-hidden rounded-xl border border-rose-100"><Table><TableHeader><TableRow><TableHead>Linha</TableHead><TableHead>Campo</TableHead><TableHead>Problema</TableHead></TableRow></TableHeader><TableBody>{clientErrors.map(error => <TableRow key={error}><TableCell>—</TableCell><TableCell>Leiaute</TableCell><TableCell>{error}</TableCell></TableRow>)}{preview?.issues.map(issue => <TableRow key={`${issue.row}-${issue.field}-${issue.message}`}><TableCell>{issue.row}</TableCell><TableCell>{issue.field}</TableCell><TableCell>{issue.message}</TableCell></TableRow>)}</TableBody></Table></div> : <Button className="mt-5 bg-emerald-700 text-white hover:bg-emerald-800" disabled={!canCommit} onClick={() => commitImport.mutate({ type, rows })}>{commitImport.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Importar {preview?.totalRows ?? 0} linha(s)</Button>}</section>}
  </div>;
}
