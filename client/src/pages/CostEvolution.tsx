import OneDriveImportSource from "@/components/OneDriveImportSource";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { BarChart3, CheckCircle2, FileSpreadsheet, LoaderCircle, Search, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

type Segment = "auto_parts" | "industry";

const config = {
  auto_parts: { label: "Autopeças", importNode: "importacoes-custos-autopecas", description: "Peças das unidades de autopeças" },
  industry: { label: "Indústria", importNode: "importacoes-custos-industria", description: "Materiais e peças da indústria" },
} as const;

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const dateOnly = (value: Date | string | null | undefined) => value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
const dateTime = (value: Date | string | null | undefined) => value ? new Date(value).toLocaleString("pt-BR") : "—";

async function fileAsBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 32_768;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...Array.from(bytes.subarray(index, index + chunk)));
  return btoa(binary);
}

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="mb-7"><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl">{title}</h1><p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-500">{description}</p></header>;
}

export function CostEvolutionImport({ segment }: { segment: Segment }) {
  const details = config[segment];
  const [file, setFile] = useState<File | null>(null);
  const [contentBase64, setContentBase64] = useState("");
  const utils = trpc.useUtils();
  const imports = trpc.costEvolution.imports.useQuery({ segment }, { retry: false });
  const permissions = trpc.portal.applicationPermissions.useQuery({ nodeKey: details.importNode });
  const preview = trpc.costEvolution.preview.useMutation({ onError: error => toast.error(error.message) });
  const commit = trpc.costEvolution.commit.useMutation({
    onSuccess: result => { toast.success(`${result.itemCount.toLocaleString("pt-BR")} itens registrados em versão pendente.`); setFile(null); setContentBase64(""); preview.reset(); utils.costEvolution.imports.invalidate({ segment }); },
    onError: error => toast.error(error.message),
  });
  const updateStatus = trpc.costEvolution.updateStatus.useMutation({
    onSuccess: () => { toast.success("Situação da versão atualizada."); utils.costEvolution.imports.invalidate({ segment }); utils.costEvolution.filterOptions.invalidate({ segment }); },
    onError: error => toast.error(error.message),
  });

  const chooseFile = async (selected: File | null) => {
    preview.reset(); setFile(null); setContentBase64("");
    if (!selected) return;
    if (!/\.xlsx$/i.test(selected.name)) return toast.error("Selecione uma planilha .xlsx exportada do RM Bis.");
    if (selected.size > 10 * 1024 * 1024) return toast.error("O arquivo deve ter no máximo 10 MB.");
    setFile(selected); setContentBase64(await fileAsBase64(selected));
  };

  return <div className="page-wrap">
    <PageHeader eyebrow={`Importações · Evolução de custos · ${details.label}`} title={`Importar custos de ${details.label.toLowerCase()}`} description={`Use a planilha original do RM Bis. O portal corrige mesclagens, remove totais e normaliza espaços sem alterar códigos, datas ou valores.`} />
    <OneDriveImportSource />
    <section className="sc-surface p-5 sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl"><h2 className="text-lg font-extrabold text-slate-950">1. Selecionar e conferir</h2><p className="mt-2 text-sm font-medium leading-6 text-slate-500">A confirmação somente é liberada após a prévia identificar os campos obrigatórios e as datas mensais.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center"><Input type="file" accept=".xlsx" onChange={event => chooseFile(event.target.files?.[0] ?? null)} /><Button disabled={!file || !contentBase64 || preview.isPending} onClick={() => file && preview.mutate({ segment, fileName: file.name, contentBase64 })} className="bg-slate-950 hover:bg-slate-800">{preview.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Analisar planilha</Button></div>
      </div>
      {file && <p className="mt-4 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Arquivo: {file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
    </section>

    {preview.data && <section className="sc-surface mt-5 overflow-hidden">
      <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-5 sm:p-7">
        {[["Itens válidos", preview.data.itemCount.toLocaleString("pt-BR")], ["Observações mensais", preview.data.observationCount.toLocaleString("pt-BR")], ["Período", `${dateOnly(preview.data.periodStart)} a ${dateOnly(preview.data.periodEnd)}`], ["Textos normalizados", preview.data.normalizedTextCellCount.toLocaleString("pt-BR")], ["Problemas", preview.data.issues.length.toLocaleString("pt-BR")]].map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-base font-extrabold text-slate-950">{value}</p></div>)}
      </div>
      {preview.data.issues.length > 0 && <div className="border-b border-rose-100 bg-rose-50 p-5 text-sm font-semibold text-rose-800">A carga possui erros. Primeiros registros: {preview.data.issues.slice(0, 5).map(issue => `Linha ${issue.row}: ${issue.message}`).join(" · ")}</div>}
      <Table><TableHeader><TableRow><TableHead>Filial</TableHead><TableHead>Código</TableHead><TableHead>Descrição</TableHead><TableHead>Comprador</TableHead><TableHead>MRP</TableHead><TableHead>Meses</TableHead></TableRow></TableHeader><TableBody>{preview.data.sample.slice(0, 10).map(row => <TableRow key={`${row.branch}-${row.aggregateCode}-${row.code}`}><TableCell>{row.branch}</TableCell><TableCell><p className="font-bold text-slate-950">{row.code}</p><p className="text-xs text-slate-500">Agregado {row.aggregateCode}</p></TableCell><TableCell className="max-w-sm">{row.description}</TableCell><TableCell>{row.buyer || "—"}</TableCell><TableCell>{row.mrp}</TableCell><TableCell>{row.observations.length}</TableCell></TableRow>)}</TableBody></Table>
      <div className="flex flex-col justify-between gap-3 border-t border-slate-100 p-5 sm:flex-row sm:items-center sm:p-7"><p className="text-sm font-semibold text-slate-600">A versão será gravada como pendente e precisará ser aprovada antes de aparecer no painel.</p><Button disabled={preview.data.issues.length > 0 || commit.isPending} onClick={() => file && commit.mutate({ segment, fileName: file.name, contentBase64 })} className="bg-emerald-700 hover:bg-emerald-800">{commit.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}Confirmar importação</Button></div>
    </section>}

    <section className="sc-surface mt-5 overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-7"><h2 className="text-lg font-extrabold text-slate-950">Versões importadas</h2><p className="mt-1 text-sm font-medium text-slate-500">Somente a versão aprovada mais recente do segmento alimenta a análise.</p></div>
      <Table><TableHeader><TableRow><TableHead>Arquivo</TableHead><TableHead>Período</TableHead><TableHead>Volume</TableHead><TableHead>Situação</TableHead><TableHead>Importado por</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{imports.data?.length ? imports.data.map(item => <TableRow key={item.id}><TableCell><p className="font-bold text-slate-950">{item.fileName}</p><p className="text-xs text-slate-500">{dateTime(item.importedAt)}</p></TableCell><TableCell>{dateOnly(item.periodStart)} a {dateOnly(item.periodEnd)}</TableCell><TableCell>{item.itemCount.toLocaleString("pt-BR")} itens<br/><span className="text-xs text-slate-500">{item.observationCount.toLocaleString("pt-BR")} observações</span></TableCell><TableCell><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-600">{item.status === "approved" ? "Aprovada" : item.status === "archived" ? "Arquivada" : "Pendente"}</span></TableCell><TableCell>{item.importedBy}</TableCell><TableCell><div className="flex flex-wrap gap-2">{item.status === "pending" && permissions.data?.approve && <Button size="sm" onClick={() => updateStatus.mutate({ id: item.id, segment, status: "approved" })}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Aprovar</Button>}{item.status !== "archived" && permissions.data?.approve && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: item.id, segment, status: "archived" })}>Arquivar</Button>}</div></TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="h-24 text-center text-sm font-medium text-slate-500">Nenhuma versão importada.</TableCell></TableRow>}</TableBody></Table>
    </section>
  </div>;
}

export function CostEvolutionDashboard({ segment }: { segment: Segment }) {
  const details = config[segment];
  const [branch, setBranch] = useState("");
  const [mrp, setMrp] = useState("");
  const [buyer, setBuyer] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const input = useMemo(() => ({ segment, branch: branch || undefined, mrp: (mrp || undefined) as "Sim" | "Não" | undefined, buyer: buyer || undefined, search: search || undefined, page, pageSize: 50 }), [segment, branch, mrp, buyer, search, page]);
  const options = trpc.costEvolution.filterOptions.useQuery({ segment }, { retry: false });
  const summary = trpc.costEvolution.summary.useQuery(input, { retry: false });
  const items = trpc.costEvolution.items.useQuery(input, { retry: false });
  const selected = items.data?.items.find(item => item.id === selectedId) ?? items.data?.items[0];
  useEffect(() => { setSelectedId(items.data?.items[0]?.id ?? null); }, [items.data?.currentImport?.id, page, branch, mrp, buyer, search]);
  const resetPage = () => setPage(1);
  const totalPages = Math.max(1, Math.ceil((items.data?.total ?? 0) / 50));

  if (options.isLoading || summary.isLoading || items.isLoading) return <div className="page-wrap"><div className="sc-surface flex items-center gap-3 p-6 text-sm font-semibold text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando evolução de custos…</div></div>;
  if (!options.data?.currentImport) return <div className="page-wrap"><PageHeader eyebrow={`Suprimentos e estoques · ${details.label}`} title={`Evolução de custos de ${details.label.toLowerCase()}`} description="O painel será liberado quando o administrador importar e aprovar a primeira versão do RM Bis." /><div className="sc-surface border border-dashed border-slate-200 p-8 text-sm font-semibold text-slate-500">Nenhuma versão aprovada para este segmento.</div></div>;

  return <div className="page-wrap">
    <PageHeader eyebrow={`Suprimentos e estoques · ${details.label}`} title={`Evolução de custos de ${details.label.toLowerCase()}`} description={`Acompanhe o custo por item nas datas de saldo do RM Bis. A versão aprovada mais recente é usada automaticamente.`} />
    <section className="sc-surface p-5 sm:p-7">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Filial<select className="control" value={branch} onChange={event => { setBranch(event.target.value); resetPage(); }}><option value="">Todas</option>{options.data.branches.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">MRP<select className="control" value={mrp} onChange={event => { setMrp(event.target.value); resetPage(); }}><option value="">Todos</option>{options.data.mrps.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Comprador<select className="control" value={buyer} onChange={event => { setBuyer(event.target.value); resetPage(); }}><option value="">Todos</option>{options.data.buyers.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Código ou descrição<Input value={search} onChange={event => { setSearch(event.target.value); resetPage(); }} placeholder="Buscar item" /></label></div>
    </section>
    <section className="mt-5 grid gap-4 md:grid-cols-4">{[["Itens filtrados", summary.data?.itemCount.toLocaleString("pt-BR") ?? "0"], ["Com custo no mês final", summary.data?.observationCount.toLocaleString("pt-BR") ?? "0"], ["Custo médio no mês final", money.format(summary.data?.latestAverageCost ?? 0)], ["Período aprovado", `${dateOnly(options.data.currentImport.periodStart)} · ${dateOnly(options.data.currentImport.periodEnd)}`]].map(([label, value]) => <div key={label} className="sc-surface p-5"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-3 text-xl font-extrabold tracking-tight text-slate-950">{value}</p></div>)}</section>
    {selected && <section className="sc-surface mt-5 p-5 sm:p-7"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dcebf7] text-slate-950"><BarChart3 className="h-5 w-5" /></span><div><h2 className="text-lg font-extrabold text-slate-950">{selected.code} · {selected.description}</h2><p className="mt-1 text-xs font-semibold text-slate-500">Clique em outro item da tabela para trocar a série.</p></div></div><div className="mt-6 h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={selected.observations.map(point => ({ date: dateOnly(point.balanceDate), cost: point.cost }))} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={value => number.format(Number(value))} /><Tooltip formatter={value => money.format(Number(value))} /><Line type="monotone" dataKey="cost" stroke="#0f172a" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div></section>}
    <section className="sc-surface mt-5 overflow-hidden"><div className="border-b border-slate-100 px-5 py-5 sm:px-7"><h2 className="text-lg font-extrabold text-slate-950">Itens e variação no período</h2><p className="mt-1 text-sm font-medium text-slate-500">50 registros por página. A variação usa a primeira e a última observação disponíveis de cada item.</p></div><Table><TableHeader><TableRow><TableHead>Filial</TableHead><TableHead>Item</TableHead><TableHead>Comprador</TableHead><TableHead>Primeiro custo</TableHead><TableHead>Último custo</TableHead><TableHead>Variação</TableHead></TableRow></TableHeader><TableBody>{items.data?.items.length ? items.data.items.map(item => <TableRow key={item.id} className={`cursor-pointer ${selected?.id === item.id ? "bg-sky-50" : ""}`} onClick={() => setSelectedId(item.id)}><TableCell>{item.branch}</TableCell><TableCell><p className="font-bold text-slate-950">{item.code}</p><p className="max-w-md text-xs text-slate-500">{item.description}</p></TableCell><TableCell>{item.buyer || "—"}</TableCell><TableCell>{item.firstCost === null ? "—" : money.format(item.firstCost)}</TableCell><TableCell>{item.lastCost === null ? "—" : money.format(item.lastCost)}</TableCell><TableCell className={item.variation === null ? "" : item.variation > 0 ? "font-bold text-rose-700" : item.variation < 0 ? "font-bold text-emerald-700" : "font-bold text-slate-600"}>{item.variation === null ? "—" : `${item.variation > 0 ? "+" : ""}${number.format(item.variation)}%`}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="h-24 text-center text-sm font-medium text-slate-500">Nenhum item encontrado para os filtros.</TableCell></TableRow>}</TableBody></Table><div className="flex items-center justify-between border-t border-slate-100 p-5"><p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Página {page} de {totalPages} · {(items.data?.total ?? 0).toLocaleString("pt-BR")} itens</p><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</Button><Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Próxima</Button></div></div></section>
  </div>;
}
