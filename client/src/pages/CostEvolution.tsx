import OneDriveImportSource from "@/components/OneDriveImportSource";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { BarChart3, CheckCircle2, Download, Filter, LoaderCircle, Search, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
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
const monthLabel = (period: string) => period ? `${period.slice(4, 6)}/${period.slice(0, 4)}` : "—";
const LINE_COLORS = ["#0f172a", "#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#4f46e5", "#ea580c", "#0d9488"];

function variationPct(current: number | null | undefined, previous: number | null | undefined) {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) * 100) / previous;
}

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

type ItemRow = { codigo: string; descricao: string; filial: string; cod_agregado: string | null; meses: { period: string; custo_medio: number | null }[] };
type SearchType = "contem" | "inicia" | "termina";

const FILIAL_UNICA_INDUSTRY = "0105";

// Identidade única de cada linha do gráfico: filial + código (mesmo item em filiais diferentes vira linhas separadas)
const itemChartKey = (item: ItemRow) => `${item.filial ?? ""}|${item.codigo}`;

// Mês sem preço (null OU 0) usa o valor do mês anterior (LOCF).
// Antes do primeiro preço válido, fica null (gráfico mostra zerado).
function buildSeries(item: ItemRow, periods: string[]) {
  const byPeriod = new Map(item.meses.map(m => [m.period, m.custo_medio]));
  const series: (number | null)[] = [];
  let last: number | null = null;
  for (const p of periods) {
    const v = byPeriod.get(p);
    if (v != null && v !== 0) { last = v; series.push(v); }
    else series.push(last);
  }
  return series;
}

// Sugestão automática de ação (resposta padrão; evolui depois para IA real)
function suggestAction(item: ItemRow, periods: string[]) {
  const values = buildSeries(item, periods).filter((v): v is number => v != null);
  if (!values.length) return "Sem histórico de custo no período.";
  const first = values[0], last = values[values.length - 1];
  const v = variationPct(last, first);
  if (v == null) return "Sem variação comparável.";
  if (v > 10) return `Alta de ${number.format(v)}% no período. Sugestão: renegociar com o fornecedor.`;
  if (v < -10) return `Redução de ${number.format(Math.abs(v))}% no período. Sugestão: manter fornecedor atual.`;
  return `Variação de ${number.format(v)}% no período. Sem ação imediata.`;
}

export function CostEvolutionDashboard({ segment }: { segment: Segment }) {
  const details = config[segment];
  const isIndustry = segment === "industry";
  const [filial, setFilial] = useState("");
  const [codAgregado, setCodAgregado] = useState("");
  const [descricao, setDescricao] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("contem");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [exporting, setExporting] = useState(false);
  const [applied, setApplied] = useState({ filial: "", codAgregado: "", descricao: "", searchType: "contem" as SearchType, periodoInicio: "", periodoFim: "" });
  const [runAnalysis, setRunAnalysis] = useState(false);
  const periodos = trpc.costEvolution.periodos.useQuery({ segment }, { retry: false });
  const filiais = trpc.costEvolution.filiais.useQuery({ segment }, { retry: false, enabled: !isIndustry });
  const agregados = trpc.costEvolution.codAgregados.useQuery({ segment }, { retry: false });
  const input = useMemo(() => ({
    segment,
    periodoInicio: applied.periodoInicio || undefined,
    periodoFim: applied.periodoFim || undefined,
    filial: (isIndustry ? FILIAL_UNICA_INDUSTRY : applied.filial) || undefined,
    codAgregado: applied.codAgregado || undefined,
  }), [segment, isIndustry, applied]);
  const analise = trpc.costEvolution.analise.useQuery(input, { retry: false, enabled: runAnalysis });
  const applyFilters = () => {
    setApplied({ filial: isIndustry ? FILIAL_UNICA_INDUSTRY : filial, codAgregado, descricao, searchType, periodoInicio, periodoFim });
    setRunAnalysis(true);
    toast.success("Filtros aplicados.");
  };
  const items: ItemRow[] = useMemo(() => (analise.data?.items ?? []) as ItemRow[], [analise.data?.items]);
  const periods: string[] = useMemo(() => (analise.data?.periodos ?? []).map((p: { period: string }) => p.period), [analise.data?.periodos]);
  const filteredItems = useMemo(() => {
    if (!applied.descricao) return items;
    const q = applied.descricao.toLowerCase();
    return items.filter(item => {
      const d = item.descricao.toLowerCase();
      if (applied.searchType === "inicia") return d.startsWith(q);
      if (applied.searchType === "termina") return d.endsWith(q);
      return d.includes(q);
    });
  }, [items, applied.descricao, applied.searchType]);
  const cardData = useMemo(() => {
    let comCusto = 0, alta = 0, reducao = 0, somaVar = 0, nVar = 0;
    filteredItems.forEach(item => {
      const values = buildSeries(item, periods).filter((v): v is number => v != null);
      if (!values.length) return;
      comCusto += 1;
      const first = values[0], last = values[values.length - 1];
      if (last > first) alta += 1;
      else if (last < first) reducao += 1;
      const varTotal = variationPct(last, first);
      if (varTotal != null) { somaVar += varTotal; nVar += 1; }
    });
    return { comCusto, alta, reducao, varMedia: nVar ? somaVar / nVar : null };
  }, [filteredItems, periods]);
  const chartData = useMemo(() => {
    if (!filteredItems.length) return [];
    return periods.map(p => {
      const point: Record<string, string | number | null> = { period: monthLabel(p) };
      filteredItems.forEach(item => {
        const series = buildSeries(item, periods);
        const idx = periods.indexOf(p);
        point[itemChartKey(item)] = series[idx] ?? 0;
      });
      return point;
    });
  }, [periods, filteredItems]);
  const exportXlsx = async () => {
    if (!filteredItems.length) { toast.error("Não há itens para exportar."); return; }
    const mod = await import("exceljs") as any;
    const ExcelJS = mod.default ?? mod;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Evolução de custos");
    const header: string[] = ["Filial", "Código", "Descrição", "Agregado"];
    periods.forEach((p, i) => {
      header.push(monthLabel(p));
      if (i < periods.length - 1) header.push(`Var ${monthLabel(p)}→${monthLabel(periods[i + 1])}`);
    });
    header.push("Sugestão de ação");
    const aoa: (string | number)[][] = [header];
    filteredItems.forEach(item => {
      const series = buildSeries(item, periods);
      const row: (string | number)[] = [item.filial, item.codigo, item.descricao, item.cod_agregado ?? ""];
      periods.forEach((p, i) => {
        const val = series[i];
        row.push(val == null ? "" : Number(val.toFixed(4)));
        if (i < periods.length - 1) {
          const v = variationPct(series[i + 1], series[i]);
          row.push(v == null ? "" : Number(v.toFixed(2)));
        }
      });
      row.push(suggestAction(item, periods));
      aoa.push(row);
    });
    sheet.addRows(aoa);
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 22;
    sheet.columns.forEach((col, index) => {
      col.width = index === 0 ? 10 : index === 1 ? 14 : index === 2 ? 50 : index === 3 ? 16 : index === header.length - 1 ? 70 : 14;
    });
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    const firstMonthCol = 5;
    const lastMonthCol = firstMonthCol + periods.length * 2 - 2;
    for (let c = firstMonthCol; c <= lastMonthCol; c++) {
      const isValue = (c - firstMonthCol) % 2 === 0;
      sheet.getColumn(c).numFmt = isValue ? "#,##0.0000" : "+0.00%;-0.00%;0.00%";
    }
    const lastColLetter = sheet.getColumn(header.length).letter;
    sheet.autoFilter = `A1:${lastColLetter}1`;
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evolucao-custos-${applied.periodoInicio || "inicio"}-${applied.periodoFim || "fim"}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const loading = periodos.isLoading || agregados.isLoading || (!isIndustry && filiais.isLoading);
  if (loading) return <div className="page-wrap"><div className="sc-surface flex items-center gap-3 p-6 text-sm font-semibold text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando evolução de custos…</div></div>;
  const analyzing = runAnalysis && (analise.isLoading || analise.isFetching) && !analise.data;
  return <div className="page-wrap">
    <PageHeader eyebrow={`Suprimentos e estoques · ${details.label}`} title={`Evolução de custos de ${details.label.toLowerCase()}`} description={`Acompanhe a evolução mês a mês do custo médio de cada item. Exporte para Excel e veja sugestões de ação.`} />
    <section className="sc-surface p-5 sm:p-7">
      {isIndustry && <div className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-xs font-semibold text-sky-800">Segmento <strong>Indústria</strong>: a análise usa sempre a filial única <strong>0105</strong> — o filtro de filial não se aplica e já fica definido automaticamente.</div>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Período inicial<select className="control" value={periodoInicio} onChange={event => { setPeriodoInicio(event.target.value); }}><option value="">Mais recente</option>{(periodos.data ?? []).map((p: { period: string }) => <option key={p.period} value={p.period}>{monthLabel(p.period)}</option>)}</select></label>
        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Período final<select className="control" value={periodoFim} onChange={event => { setPeriodoFim(event.target.value); }}><option value="">Mais recente</option>{(periodos.data ?? []).map((p: { period: string }) => <option key={p.period} value={p.period}>{monthLabel(p.period)}</option>)}</select></label>
        {isIndustry ? <div className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Filial<div className="control flex items-center justify-between"><span className="font-extrabold text-slate-950">{FILIAL_UNICA_INDUSTRY}</span><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-emerald-700">única</span></div></div> : <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Filial<select className="control" value={filial} onChange={event => { setFilial(event.target.value); }}><option value="">Todas</option>{(filiais.data ?? []).map((f: { filial: string }) => <option key={f.filial} value={f.filial}>{f.filial}</option>)}</select></label>}
        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Item agregado<select className="control" value={codAgregado} onChange={event => { setCodAgregado(event.target.value); }}><option value="">Todos</option>{(agregados.data ?? []).map((a: { cod_agregado: string }) => <option key={a.cod_agregado} value={a.cod_agregado}>{a.cod_agregado}</option>)}</select></label>
        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Descrição<Input value={descricao} onChange={event => { setDescricao(event.target.value); }} onKeyDown={event => { if (event.key === "Enter") applyFilters(); }} placeholder="Buscar por descrição" /></label>
        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Tipo de busca<select className="control" value={searchType} onChange={event => { setSearchType(event.target.value as SearchType); }}><option value="contem">Contém</option><option value="inicia">Inicia com</option><option value="termina">Termina com</option></select></label>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2"><Button onClick={applyFilters} disabled={analise.isLoading} className="bg-slate-950 hover:bg-slate-800">{analise.isLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Filter className="mr-2 h-4 w-4" />}Filtrar</Button><Button variant="outline" disabled={exporting} onClick={() => { setExporting(true); exportXlsx().finally(() => setExporting(false)); }}>{exporting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Exportar para Excel</Button></div>
    </section>
    <section className="sticky top-0 z-10 mt-5 grid gap-4 bg-[#f2f4f5] py-3 md:grid-cols-3 xl:grid-cols-6">
      {analyzing ? <div className="sc-surface col-span-full flex items-center gap-3 p-4 text-sm font-semibold text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando análise…</div> : [["Custo total", money.format(0)], ["Variação vs mês anterior", cardData.varMedia == null ? "—" : `${cardData.varMedia > 0 ? "+" : ""}${number.format(cardData.varMedia)}%`], ["Itens com custo", cardData.comCusto.toLocaleString("pt-BR")], ["Itens com alta", cardData.alta.toLocaleString("pt-BR")], ["Itens com redução", cardData.reducao.toLocaleString("pt-BR")], ["Base de comparação", periods.length ? `${monthLabel(periods[0])} a ${monthLabel(periods[periods.length - 1])}` : "—"]].map(([label, value]) => <div key={label} className="sc-surface p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-lg font-extrabold tracking-tight text-slate-950">{value}</p></div>)}
    </section>
    {runAnalysis && !analise.isLoading && !applied.codAgregado && filteredItems.length > 0 && <section className="sc-surface mt-5 p-5 sm:p-7"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dcebf7] text-slate-950"><BarChart3 className="h-5 w-5" /></span><div><h2 className="text-lg font-extrabold text-slate-950">Gráfico de evolução</h2><p className="mt-1 text-xs font-semibold text-slate-500">Selecione um <strong>Item agregado</strong> e clique em <strong>Filtrar</strong> para exibir o gráfico de evolução de custos. Sem filtro de agregado, o gráfico fica oculto para manter a página rápida — os dados completos estão na tabela abaixo.</p></div></div></section>}
    {applied.codAgregado && chartData.length > 0 && <section className="sc-surface mt-5 p-5 sm:p-7"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dcebf7] text-slate-950"><BarChart3 className="h-5 w-5" /></span><div><h2 className="text-lg font-extrabold text-slate-950">Evolução do agregado {applied.codAgregado}</h2><p className="mt-1 text-xs font-semibold text-slate-500">Uma linha por item{isIndustry ? "" : " e por filial"}. Meses sem preço usam o valor do mês anterior.</p></div></div><div className="mt-6 h-80"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="period" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={value => number.format(Number(value))} /><Tooltip formatter={value => money.format(Number(value))} />{filteredItems.map((item, idx) => <Line key={itemChartKey(item)} type="monotone" dataKey={itemChartKey(item)} name={`${item.codigo} · ${item.descricao}${item.filial && !isIndustry ? ` · Filial ${item.filial}` : ""}`} stroke={LINE_COLORS[idx % LINE_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />)}</LineChart></ResponsiveContainer></div></section>}
    <section className="sc-surface mt-5 overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-7"><div><h2 className="text-lg font-extrabold text-slate-950">Evolução mês a mês por item</h2><p className="mt-1 text-sm font-medium text-slate-500">{runAnalysis ? `${filteredItems.length.toLocaleString("pt-BR")} itens · meses sem preço usam o valor do mês anterior` : "Defina os filtros acima e clique em Filtrar para carregar a análise."}</p></div></div>
      <div className="overflow-x-auto">
        <Table><TableHeader><TableRow><TableHead>Filial</TableHead><TableHead>Código</TableHead><TableHead>Descrição</TableHead>{periods.map((p, i) => <TableHead key={p}>{monthLabel(p)}{i < periods.length - 1 && <span className="block text-[10px] font-semibold text-slate-400">var → {monthLabel(periods[i + 1])}</span>}</TableHead>)}<TableHead>Sugestão de ação</TableHead></TableRow></TableHeader><TableBody>{!runAnalysis ? <TableRow><TableCell colSpan={4 + periods.length} className="h-24 text-center text-sm font-medium text-slate-500">Defina os filtros acima e clique em <strong>Filtrar</strong> para carregar a análise de custos.</TableCell></TableRow> : analise.isLoading && !filteredItems.length ? <TableRow><TableCell colSpan={4 + periods.length} className="h-24 text-center text-sm font-medium text-slate-500"><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />Carregando análise…</TableCell></TableRow> : filteredItems.length ? filteredItems.map(item => { const series = buildSeries(item, periods); return <TableRow key={`${item.codigo}-${item.filial}`}><TableCell>{item.filial}</TableCell><TableCell className="font-bold text-slate-950">{item.codigo}</TableCell><TableCell className="max-w-xs">{item.descricao}</TableCell>{periods.map((p, i) => { const val = series[i]; const v = variationPct(series[i + 1], series[i]); return <TableCell key={p}><p className="whitespace-nowrap">{val == null ? "—" : money.format(val)}</p>{i < periods.length - 1 && <p className={`whitespace-nowrap text-xs font-semibold ${v == null ? "text-slate-400" : v > 0 ? "text-rose-700" : v < 0 ? "text-emerald-700" : "text-slate-600"}`}>{v == null ? "—" : `${v > 0 ? "+" : ""}${number.format(v)}%`}</p>}</TableCell>; })}<TableCell className="max-w-xs text-xs font-medium text-slate-600">{suggestAction(item, periods)}</TableCell></TableRow>; }) : <TableRow><TableCell colSpan={4 + periods.length} className="h-24 text-center text-sm font-medium text-slate-500">Nenhum item encontrado para os filtros.</TableCell></TableRow>}</TableBody></Table>
      </div>
    </section>
  </div>;
}