import OneDriveImportSource from "@/components/OneDriveImportSource";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { BarChart3, CheckCircle2, ChevronLeft, ChevronRight, Download, Filter, LoaderCircle, RefreshCw, Search, UploadCloud, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
function trunc(text: string | null | undefined, max: number) {
  const value = (text ?? "").trim();
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
function pct(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${number.format(value)}%`;
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
// BLOCO 0 (18/10/2026): combo do Item agregado pesquisável, com descrição e botão de limpar.
// B2: o campo selecionado mostra código em negrito + descrição (quebra em até 2 linhas,
// o campo expande) e um botão X para limpar e voltar à digitação — amigável no celular.
function AgregadoCombobox({ options, value, onSelect, loading }: { options: { cod_agregado: string; descricao: string | null }[]; value: string; onSelect: (value: string) => void; loading?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selecionado = options.find(option => option.cod_agregado === value) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? options.filter(option => option.cod_agregado.toLowerCase().includes(q) || (option.descricao ?? "").toLowerCase().includes(q)) : options;
    return base.slice(0, 50);
  }, [options, query]);
  if (value) {
    return <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="min-w-0 flex-1"><p className="text-sm font-extrabold text-slate-950">{value}</p>{selecionado?.descricao && <p className="mt-0.5 text-xs font-medium leading-5 text-slate-600">{trunc(selecionado.descricao, 120)}</p>}</div>
      <button type="button" title="Limpar seleção e digitar outro agregado" className="mt-0.5 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" onClick={() => onSelect("")}><X className="h-4 w-4" /></button>
    </div>;
  }
  return <div className="relative">
    <Input value={query} placeholder={loading ? "Carregando…" : "Digite o código ou a descrição do agregado…"} onChange={event => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} inputMode="search" />
    {open && filtered.length > 0 && <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
      {filtered.map(option => <button key={option.cod_agregado} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100" onMouseDown={event => event.preventDefault()} onClick={() => { onSelect(option.cod_agregado); setQuery(""); setOpen(false); }}><span className="font-extrabold text-slate-950">{option.cod_agregado}</span>{option.descricao ? <span className="text-slate-600"> · {trunc(option.descricao, 60)}</span> : null}</button>)}
      {options.length > 50 && query.trim() === "" && <p className="px-3 py-2 text-xs font-medium text-slate-400">Digite para filtrar os {options.length.toLocaleString("pt-BR")} agregados.</p>}
    </div>}
    {open && query.trim() !== "" && filtered.length === 0 && <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500 shadow-lg">Nenhum agregado encontrado para "{query}".</div>}
  </div>;
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
type CurveCode = "A" | "B" | "C" | "D" | "E" | "SEM_CURVA";
type Limites = { A: number; B: number; C: number; D: number; E: number };
const LIMITES_PADRAO: Limites = { A: 10, B: 15, C: 20, D: 20, E: 20 };
type CurveSummary = { itemCount: number; itemsWithBase: number; averageVariationPercent: number | null; weightedVariationPercent?: number | null; estimatedImpact: number | null; highAlerts: number };
type BenchmarkReport = {
  internalInflationPercent?: number | null;
  weightedMonthlyVariationPercent?: number | null;
  ipcaPercent?: number | null;
  dolarVariationPercent?: number | null;
  indicesStatus?: { IPCA?: string; DOLAR?: string };
  countsByCurve?: Partial<Record<string, number>>;
  countsByAlert?: Partial<Record<string, number>>;
  byCurve?: Partial<Record<CurveCode, CurveSummary>>;
};
type ItemRow = {
  codigo: string; descricao: string; filial: string; cod_agregado: string | null;
  curve?: CurveCode; costStatus?: "COM_BASE" | "SEM_BASE_CUSTO" | "CURVA_NAO_VINCULADA";
  estoque?: number | null; estoqueValor?: number | null; estoqueAgregado?: number | null;
  variacaoPercent?: number | null; impactoEstimado?: number | null; consumoMedioMensal?: number | null;
  meses: { period: string; custo_medio: number | null }[];
};
type Criterio = "todos" | "alta" | "reducao" | "acima-limite" | "sem-base" | "sem-curva" | "curva-A" | "curva-B" | "curva-C" | "curva-D" | "curva-E";
type OrdenacaoItens = "impacto" | "variacao" | "codigo" | "descricao";
const CRITERIO_LABELS: Record<Criterio, string> = { todos: "Todos os itens", alta: "Itens com alta", reducao: "Itens com redução", "acima-limite": "Itens acima do limite", "sem-base": "Sem base de custo", "sem-curva": "Sem curva", "curva-A": "Curva A", "curva-B": "Curva B", "curva-C": "Curva C", "curva-D": "Curva D", "curva-E": "Curva E" };
type SearchType = "contem" | "inicia" | "termina";
const FILIAL_UNICA_INDUSTRY = "0105";
const itemChartKey = (item: ItemRow) => `${item.filial ?? ""}|${item.codigo}`;
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
function sugestaoDeAcao(item: ItemRow, periods: string[], limites: Limites) {
  const values = buildSeries(item, periods).filter((v): v is number => v != null);
  if (!values.length) return "Sem histórico de custo no período.";
  const first = values[0], last = values[values.length - 1];
  const v = variationPct(last, first);
  if (v == null) return "Sem variação comparável.";
  // CORREÇÃO tsc 18/10: curva pode ser "SEM_CURVA", que não existe nos limites A–E.
  const limite = item.curve && item.curve !== "SEM_CURVA" ? (limites[item.curve as keyof Limites] ?? LIMITES_PADRAO[item.curve as keyof Limites]) : 20;
  if (v > 0 && Math.abs(v) >= limite) return `Alta de ${number.format(v)}% no período (limite da régua: ${number.format(limite)}%). Sugestão: renegociar com o fornecedor.`;
  if (v < 0 && Math.abs(v) >= limite) return `Redução de ${number.format(Math.abs(v))}% no período (limite da régua: ${number.format(limite)}%). Sugestão: manter fornecedor atual.`;
  return `Variação de ${number.format(v)}% no período. Sem ação imediata.`;
}
export function CostEvolutionDashboard({ segment }: { segment: Segment }) {
  const details = config[segment];
  const isIndustry = segment === "industry";
  // CORREÇÃO tsc 18/10: utils declarado para a exportação do grid paginado.
  const utils = trpc.useUtils();
  const [filial, setFilial] = useState("");
  const [codAgregado, setCodAgregado] = useState("");
  const [descricao, setDescricao] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("contem");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  // B2: limites de alerta configuráveis pelo usuário (defaults pré-preenchidos).
  const [limitesTexto, setLimitesTexto] = useState({ A: "10", B: "15", C: "20", D: "20", E: "20" });
  const [exporting, setExporting] = useState(false);
  const [applied, setApplied] = useState<{ filial: string; codAgregado: string; descricao: string; searchType: SearchType; periodoInicio: string; periodoFim: string; limitesAlerta: Partial<Limites> }>({ filial: "", codAgregado: "", descricao: "", searchType: "contem", periodoInicio: "", periodoFim: "", limitesAlerta: {} });
  const [runAnalysis, setRunAnalysis] = useState(false);
  const [grid, setGrid] = useState<{ open: boolean; criterio: Criterio; pagina: number; ordenacao: OrdenacaoItens }>({ open: false, criterio: "todos", pagina: 1, ordenacao: "impacto" });
  const gridRef = useRef<HTMLElement | null>(null);
  const periodos = trpc.costEvolution.periodos.useQuery({ segment }, { retry: false });
  const filiais = trpc.costEvolution.filiais.useQuery({ segment }, { retry: false, enabled: !isIndustry });
  const agregados = trpc.costEvolution.codAgregadosDetalhados.useQuery({ segment }, { retry: false });
  const atualizarIndices = trpc.costEvolution.atualizarIndices.useMutation({
    onSuccess: result => toast.success(result.mensagem),
    onError: error => toast.error(error.message),
  });
  const limitesAlerta = useMemo(() => {
    const parse = (value: string) => {
      const n = Number(String(value).trim().replace(",", "."));
      if (!Number.isFinite(n)) return undefined;
      return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
    };
    const parsed: Partial<Limites> = {};
    for (const curva of ["A", "B", "C", "D", "E"] as const) {
      const valor = parse(limitesTexto[curva]);
      if (valor != null) parsed[curva] = valor;
    }
    return parsed;
  }, [limitesTexto]);
  const input = useMemo(() => ({
    segment,
    periodoInicio: applied.periodoInicio || undefined,
    periodoFim: applied.periodoFim || undefined,
    filial: isIndustry ? undefined : (applied.filial || undefined),
    codAgregado: applied.codAgregado || undefined,
    descricao: applied.descricao || undefined,
    searchType: applied.searchType,
    limitesAlerta: applied.limitesAlerta,
  }), [segment, isIndustry, applied]);
  const analise = trpc.costEvolution.analise.useQuery(input, { retry: false, enabled: runAnalysis });
  const itensInput = useMemo(() => ({ ...input, criterio: grid.criterio, ordenacao: grid.ordenacao, pagina: grid.pagina, itensPorPagina: 50 }), [input, grid]);
  const itens = trpc.costEvolution.itensEvolutivos.useQuery(itensInput, { retry: false, enabled: runAnalysis && grid.open, placeholderData: prev => prev });
  const chartItems = trpc.costEvolution.itensEvolutivos.useQuery({ ...input, criterio: "todos" as const, ordenacao: "codigo" as const, pagina: 1, itensPorPagina: 200 }, { retry: false, enabled: runAnalysis && Boolean(applied.codAgregado) });
  const applyFilters = () => {
    setApplied({ filial: isIndustry ? "" : filial, codAgregado, descricao, searchType, periodoInicio, periodoFim, limitesAlerta });
    setRunAnalysis(true);
    setGrid(g => ({ ...g, open: false, pagina: 1 }));
    toast.success("Filtros aplicados.");
  };
  const openGrid = (criterio: Criterio) => {
    setGrid(g => ({ ...g, open: true, criterio, pagina: 1 }));
    setTimeout(() => gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };
  const analiseData = analise.data;
  const benchmark = analiseData?.benchmarkReport as BenchmarkReport | undefined;
  const periods: string[] = useMemo(() => (analiseData?.periodos ?? []).map((p: { period: string }) => p.period), [analiseData?.periodos]);
  const limitesEfetivos: Limites = (analiseData?.limites as Limites | undefined) ?? LIMITES_PADRAO;
  const curvasSegmento = isIndustry ? (["A", "B", "C"] as const) : (["A", "B", "C", "D", "E"] as const);
  const reguaLabel = curvasSegmento.map(curva => `${curva} ≥ ${number.format(limitesEfetivos[curva])}%`).join(" · ");
  const efetivoInicio = analiseData?.periodoEfetivoInicio as string | null | undefined;
  const efetivoFim = analiseData?.periodoEfetivoFim as string | null | undefined;
  const valorPeriodoInicio = applied.periodoInicio || (runAnalysis && efetivoInicio ? efetivoInicio : "");
  const valorPeriodoFim = applied.periodoFim || (runAnalysis && efetivoFim ? efetivoFim : "");
  const chartItemsList: ItemRow[] = (chartItems.data?.items ?? []) as ItemRow[];
  const chartData = useMemo(() => {
    if (!chartItemsList.length) return [];
    return periods.map(p => {
      const point: Record<string, string | number | null> = { period: monthLabel(p) };
      chartItemsList.forEach(item => {
        const series = buildSeries(item, periods);
        const idx = periods.indexOf(p);
        point[itemChartKey(item)] = series[idx] ?? 0;
      });
      return point;
    });
  }, [periods, chartItemsList]);
  const pageItems: ItemRow[] = (itens.data?.items ?? []) as ItemRow[];
  const totalPaginas = itens.data ? Math.max(1, Math.ceil(itens.data.total / itens.data.itensPorPagina)) : 1;
  // CORREÇÃO 18/10 (ordem de hooks): este useMemo PRECISA ficar antes do retorno
  // antecipado de carregamento — caso contrário o React derruba a tela ao alternar
  // entre "carregando" e "pronto".
  const curveRows = useMemo(() => Object.entries(benchmark?.byCurve ?? {})
    .filter((entry): entry is [CurveCode, CurveSummary] => Boolean(entry[1]))
    .filter(([curve]) => curvasSegmento.includes(curve as any))
    .sort(([a], [b]) => a.localeCompare(b)), [benchmark?.byCurve, curvasSegmento]);
  const exportXlsx = async () => {
    if (!runAnalysis) { toast.error("Aplique os filtros antes de exportar."); return; }
    setExporting(true);
    try {
      let all: ItemRow[] = [];
      let pagina = 1;
      for (;;) {
        const data = await utils.costEvolution.itensEvolutivos.fetch({ ...input, criterio: grid.criterio, ordenacao: "impacto", pagina, itensPorPagina: 200 });
        all = all.concat((data.items ?? []) as ItemRow[]);
        if (all.length >= data.total || pagina >= 25) {
          if (pagina >= 25 && data.total > all.length) toast.warning(`Exportação limitada aos primeiros ${all.length.toLocaleString("pt-BR")} itens. Refine os filtros para exportar o restante.`);
          break;
        }
        pagina += 1;
      }
      if (!all.length) { toast.error("Não há itens para exportar."); return; }
      const mod = await import("exceljs") as any;
      const ExcelJS = mod.default ?? mod;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Evolução de custos");
      const header: string[] = ["Filial", "Código", "Descrição", "Agregado"];
      periods.forEach((p, i) => {
        header.push(monthLabel(p));
        if (i < periods.length - 1) header.push(`Var ${monthLabel(p)}→${monthLabel(periods[i + 1])}`);
      });
      header.push("Variação total %", "vs IPCA (p.p.)", "Consumo médio mensal", "Impacto estimado", "Sugestão de ação");
      const ipca = benchmark?.ipcaPercent ?? null;
      const aoa: (string | number)[][] = [header];
      all.forEach(item => {
        const series = buildSeries(item, periods);
        const row: (string | number)[] = [item.filial, item.codigo, item.descricao, item.cod_agregado ?? ""];
        periods.forEach((p, i) => {
          const val = series[i];
          row.push(val == null ? "" : Number(val.toFixed(4)));
          if (i < periods.length - 1) {
            const v = variationPct(series[i + 1], series[i]);
            // Divide por 100 porque a coluna usa formato de % (o Excel multiplica por 100 ao exibir).
            row.push(v == null ? "" : Number((v / 100).toFixed(6)));
          }
        });
        const vsIpca = item.variacaoPercent != null && ipca != null ? Number((item.variacaoPercent - ipca).toFixed(2)) : "";
        row.push(item.variacaoPercent == null ? "" : Number(item.variacaoPercent.toFixed(2)), vsIpca, item.consumoMedioMensal == null ? "" : Number(item.consumoMedioMensal.toFixed(2)), item.impactoEstimado == null ? "" : Number(item.impactoEstimado.toFixed(2)), sugestaoDeAcao(item, periods, limitesEfetivos));
        aoa.push(row);
      });
      sheet.addRows(aoa);
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 22;
      sheet.columns.forEach((col: { width?: number }, index: number) => {
        col.width = index === 0 ? 10 : index === 1 ? 14 : index === 2 ? 50 : index === 3 ? 16 : index >= header.length - 5 ? 18 : 14;
      });
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      const lastColLetter = sheet.getColumn(header.length).letter;
      sheet.autoFilter = `A1:${lastColLetter}1`;
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
      const seg = segment === "industry" ? "industria" : "autopecas";
      a.download = `evolucao-custos-${seg}-${CRITERIO_LABELS[grid.criterio].toLowerCase().replace(/\s+/g, "-")}-${stamp}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${all.length.toLocaleString("pt-BR")} itens exportados.`);
    } catch (error) {
      toast.error("Falha ao exportar para Excel.");
    } finally {
      setExporting(false);
    }
  };
  const loading = periodos.isLoading || agregados.isLoading || (!isIndustry && filiais.isLoading);
  if (loading) return <div className="page-wrap"><div className="sc-surface flex items-center gap-3 p-6 text-sm font-semibold text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando evolução de custos…</div></div>;
  const analyzing = runAnalysis && (analise.isLoading || analise.isFetching) && !analiseData;
  return <div className="page-wrap">
    <PageHeader eyebrow={`Suprimentos e estoques · ${details.label}`} title={`Evolução de custos de ${details.label.toLowerCase()}`} description={`Acompanhe a evolução mês a mês do custo médio de cada item, com impacto financeiro, régua de alerta configurável e comparativos oficiais (IPCA e dólar PTAX).`} />
    <section className="sc-surface p-5 sm:p-7">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Período inicial<select className="control" value={valorPeriodoInicio} onChange={event => setPeriodoInicio(event.target.value)}><option value="">Mais recente</option>{(periodos.data ?? []).map((p: { period: string }) => <option key={p.period} value={p.period}>{monthLabel(p.period)}{!applied.periodoInicio && runAnalysis && efetivoInicio === p.period ? " (padrão)" : ""}</option>)}</select></label>
        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Período final<select className="control" value={valorPeriodoFim} onChange={event => setPeriodoFim(event.target.value)}><option value="">Mais recente</option>{(periodos.data ?? []).map((p: { period: string }) => <option key={p.period} value={p.period}>{monthLabel(p.period)}{!applied.periodoFim && runAnalysis && efetivoFim === p.period ? " (padrão)" : ""}</option>)}</select></label>
        {isIndustry ? <div className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Filial<div className="control flex items-center justify-between"><span className="font-extrabold text-slate-950">{FILIAL_UNICA_INDUSTRY}</span><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-emerald-700">única</span></div></div> : <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Filial<select className="control" value={filial} onChange={event => setFilial(event.target.value)}><option value="">Todas</option>{(filiais.data ?? []).map((f: { filial: string }) => <option key={f.filial} value={f.filial}>{f.filial}</option>)}</select></label>}
        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Item agregado<AgregadoCombobox options={(agregados.data ?? []) as { cod_agregado: string; descricao: string | null }[]} value={codAgregado} onSelect={setCodAgregado} loading={agregados.isLoading} /></label>
        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Descrição<Input value={descricao} onChange={event => setDescricao(event.target.value)} onKeyDown={event => { if (event.key === "Enter") applyFilters(); }} placeholder="Buscar por descrição" /></label>
        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Tipo de busca<select className="control" value={searchType} onChange={event => setSearchType(event.target.value as SearchType)}><option value="contem">Contém</option><option value="inicia">Inicia com</option><option value="termina">Termina com</option></select></label>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500"><span>Limites de alerta (%) — régua por curva</span><div className="flex flex-wrap gap-2">{(["A", "B", "C", "D", "E"] as const).filter(curva => isIndustry ? curva !== "D" && curva !== "E" : true).map(curva => <label key={curva} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1"><span className="text-[11px] font-extrabold text-slate-700">{curva}</span><input className="w-14 rounded border border-slate-200 px-1.5 py-1 text-right text-sm font-bold text-slate-950" inputMode="decimal" title="Valor entre 0 e 100" value={limitesTexto[curva]} onChange={event => setLimitesTexto(prev => ({ ...prev, [curva]: event.target.value }))} /><span className="text-xs font-semibold text-slate-500">%</span></label>)}</div></div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={atualizarIndices.isPending} title="Completa os meses faltantes de IPCA (IBGE) e dólar PTAX (Banco Central) no cache do portal" onClick={() => atualizarIndices.mutate()}>{atualizarIndices.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Atualizar índices</Button><Button onClick={applyFilters} disabled={analise.isLoading} className="bg-slate-950 hover:bg-slate-800">{analise.isLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Filter className="mr-2 h-4 w-4" />}Filtrar</Button></div>
    </section>
    <section className="mt-5 grid grid-cols-2 gap-3 bg-[#f2f4f5] py-3 md:sticky md:top-0 md:z-10 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
      {analyzing ? <div className="sc-surface col-span-full flex items-center gap-3 p-4 text-sm font-semibold text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando análise…</div> : [
        ["Custo total", analiseData ? money.format((analiseData.cards as { custoTotal: number }).custoTotal) : money.format(0)],
        ["Variação ponderada", benchmark?.weightedMonthlyVariationPercent == null ? "—" : pct(benchmark.weightedMonthlyVariationPercent)],
        ["Itens com custo", analiseData ? (analiseData.cards as { comCusto: number }).comCusto.toLocaleString("pt-BR") : "0"],
        ["Itens com alta", analiseData ? (analiseData.cards as { alta: number }).alta.toLocaleString("pt-BR") : "0", "alta" as Criterio],
        ["Itens com redução", analiseData ? (analiseData.cards as { reducao: number }).reducao.toLocaleString("pt-BR") : "0", "reducao" as Criterio],
        ["Base de comparação", periods.length ? `${monthLabel(periods[0])} a ${monthLabel(periods[periods.length - 1])}` : "—"],
      ].map(([label, value, criterio]) => <div key={label as string} className={`sc-surface p-4${criterio ? " cursor-pointer transition hover:bg-slate-50" : ""}`} onClick={criterio ? () => openGrid(criterio as Criterio) : undefined} title={criterio ? "Ver os itens no detalhe paginado" : undefined}><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-lg font-extrabold tracking-tight text-slate-950">{value}</p></div>)}
    </section>
    {runAnalysis && benchmark && <section className="sc-surface mt-5 overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Cruzamento gerencial</p><h2 className="mt-1 text-lg font-extrabold text-slate-950">Curva ABC na evolução de custos</h2><p className="mt-1 text-sm font-medium text-slate-500">Régua de alerta aplicada: {reguaLabel}. Clique em uma curva ou no número de itens acima do limite para ver o detalhe paginado.</p></div>{benchmark.internalInflationPercent != null && <div className="rounded-xl bg-sky-50 px-4 py-3 text-right"><p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-sky-700">Inflação interna</p><p className="mt-1 text-xl font-extrabold text-sky-950">{pct(benchmark.internalInflationPercent)}</p>{benchmark.ipcaPercent != null && <p className="mt-1 text-[11px] font-bold text-sky-700">IPCA do período: {pct(benchmark.ipcaPercent)}</p>}{benchmark.dolarVariationPercent != null && <p className="text-[11px] font-bold text-sky-700">Dólar PTAX: {pct(benchmark.dolarVariationPercent)}</p>}{benchmark.indicesStatus && Object.values(benchmark.indicesStatus).some(status => status === "indisponivel") && <p className="mt-1 max-w-52 text-[10px] font-semibold leading-4 text-amber-700">Fonte oficial indisponível agora — usando o último valor gravado.</p>}</div>}</div></div>
      {curveRows.length > 0 && <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Curva</TableHead><TableHead>Itens</TableHead><TableHead>Com base</TableHead><TableHead>Variação ponderada</TableHead><TableHead>Impacto estimado</TableHead><TableHead title={`Itens da curva cuja variação do período passou da régua: ${reguaLabel}`}>Itens acima do limite</TableHead></TableRow></TableHeader><TableBody>{curveRows.map(([curve, summary]) => <TableRow key={curve}><TableCell><button type="button" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-800 transition hover:bg-sky-100 hover:text-sky-800" title={`Ver os itens da curva ${curve}`} onClick={() => openGrid(`curva-${curve.toLowerCase()}` as Criterio)}>{curve}</button></TableCell><TableCell>{summary.itemCount.toLocaleString("pt-BR")}</TableCell><TableCell>{summary.itemsWithBase.toLocaleString("pt-BR")}</TableCell><TableCell>{summary.weightedVariationPercent == null ? "—" : pct(summary.weightedVariationPercent)}</TableCell><TableCell>{summary.estimatedImpact == null ? "—" : money.format(summary.estimatedImpact)}</TableCell><TableCell>{summary.highAlerts > 0 ? <button type="button" className="font-extrabold text-rose-700 underline decoration-dotted underline-offset-2 hover:text-rose-900" title="Ver os itens acima do limite" onClick={() => openGrid("acima-limite")}>{summary.highAlerts.toLocaleString("pt-BR")}</button> : "0"}</TableCell></TableRow>)}</TableBody></Table></div>}
      {(benchmark.countsByAlert?.SEM_BASE != null || benchmark.countsByCurve?.SEM_CURVA != null) && <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3 sm:px-7">{benchmark.countsByAlert?.SEM_BASE != null && <button type="button" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200" onClick={() => openGrid("sem-base")}>Sem base de custo: {benchmark.countsByAlert.SEM_BASE.toLocaleString("pt-BR")}</button>}{benchmark.countsByCurve?.SEM_CURVA != null && <button type="button" className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 hover:bg-amber-200" onClick={() => openGrid("sem-curva")}>Sem curva: {benchmark.countsByCurve.SEM_CURVA.toLocaleString("pt-BR")}</button>}</div>}
      {curveRows.length === 0 && <div className="p-5 text-sm font-medium text-slate-500 sm:p-7">O cruzamento ABC ainda não foi retornado para este conjunto de filtros. A tela já está preparada para exibi-lo assim que a carga aprovada da Curva ABC estiver vinculada aos itens.</div>}
    </section>}
    {applied.codAgregado && chartData.length > 0 && <section className="sc-surface mt-5 p-5 sm:p-7"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dcebf7] text-slate-950"><BarChart3 className="h-5 w-5" /></span><div><h2 className="text-lg font-extrabold text-slate-950">Evolução do agregado {applied.codAgregado}</h2><p className="mt-1 text-xs font-semibold text-slate-500">Uma linha por item{isIndustry ? "" : " e por filial"}. Meses sem preço usam o valor do mês anterior.</p></div></div><div className="mt-6 h-80"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="period" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={value => number.format(Number(value))} /><Tooltip formatter={value => money.format(Number(value))} />{chartItemsList.map((item, idx) => <Line key={itemChartKey(item)} type="monotone" dataKey={itemChartKey(item)} name={`${item.codigo} · ${trunc(item.descricao, 40)}${item.filial && !isIndustry ? ` · Filial ${item.filial}` : ""}`} stroke={LINE_COLORS[idx % LINE_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />)}</LineChart></ResponsiveContainer></div></section>}
    {runAnalysis && !grid.open && <section className="sc-surface mt-5 flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7"><div><h2 className="text-lg font-extrabold text-slate-950">Evolução mês a mês por item</h2><p className="mt-1 text-sm font-medium text-slate-500">Abra o detalhe paginado para navegar pelos itens dos filtros atuais, com meses, variação, impacto, consumo e estoque.</p></div><Button variant="outline" onClick={() => openGrid("todos")}><BarChart3 className="mr-2 h-4 w-4" />Ver evolução por item</Button></section>}
    {runAnalysis && grid.open && <section ref={gridRef} className="sc-surface mt-5 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-7">
        <div><h2 className="text-lg font-extrabold text-slate-950">{CRITERIO_LABELS[grid.criterio]} · Evolução mês a mês por item</h2><p className="mt-1 text-sm font-medium text-slate-500">{itens.data ? `${itens.data.total.toLocaleString("pt-BR")} itens no critério · ${itens.data.itensPorPagina} por página · meses sem preço usam o valor do mês anterior` : "Carregando itens…"}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="control h-9 w-44" value={grid.ordenacao} onChange={event => setGrid(prev => ({ ...prev, ordenacao: event.target.value as OrdenacaoItens, pagina: 1 }))}><option value="impacto">Ordenar: impacto</option><option value="variacao">Ordenar: variação</option><option value="codigo">Ordenar: código</option><option value="descricao">Ordenar: descrição</option></select>
          <Button size="sm" variant="outline" disabled={exporting} onClick={() => { exportXlsx(); }} title="Exporta todos os itens do critério atual">{exporting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Exportar</Button>
          <Button size="sm" variant="outline" onClick={() => setGrid(prev => ({ ...prev, open: false }))}><X className="mr-1.5 h-4 w-4" />Fechar</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3 sm:px-7">{(["todos", "alta", "reducao", "acima-limite", "sem-base", "sem-curva", "curva-A", "curva-B", "curva-C", "curva-D", "curva-E"] as Criterio[]).map(criterio => <button key={criterio} type="button" className={`rounded-full px-3 py-1 text-xs font-bold transition ${grid.criterio === criterio ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`} onClick={() => setGrid(prev => ({ ...prev, criterio, pagina: 1 }))}>{CRITERIO_LABELS[criterio]}</button>)}</div>
      <div className="overflow-x-auto">
        <Table><TableHeader><TableRow><TableHead>Filial</TableHead><TableHead>Código</TableHead><TableHead>Descrição</TableHead><TableHead>Curva ABC</TableHead>{periods.map((p, i) => <TableHead key={p}>{monthLabel(p)}{i < periods.length - 1 && <span className="block text-[10px] font-semibold text-slate-400">var → {monthLabel(periods[i + 1])}</span>}</TableHead>)}<TableHead>Variação total</TableHead>{benchmark?.ipcaPercent != null && <TableHead title="Diferença em pontos percentuais entre a variação do item e o IPCA acumulado no período">vs IPCA (p.p.)</TableHead>}<TableHead>Consumo méd./mês</TableHead><TableHead>Impacto estimado</TableHead><TableHead>Estoque</TableHead><TableHead>Sugestão de ação</TableHead></TableRow></TableHeader><TableBody>{itens.isLoading && !pageItems.length ? <TableRow><TableCell colSpan={6 + periods.length + 4} className="h-24 text-center text-sm font-medium text-slate-500"><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />Carregando itens…</TableCell></TableRow> : pageItems.length ? pageItems.map(item => { const series = buildSeries(item, periods); const vsIpca = item.variacaoPercent != null && benchmark?.ipcaPercent != null ? item.variacaoPercent - (benchmark.ipcaPercent as number) : null; const estoqueTexto = item.estoque != null || item.estoqueValor != null ? `${item.estoque != null ? number.format(item.estoque) : "—"}${item.estoqueValor != null ? ` · ${money.format(item.estoqueValor)}` : ""}` : item.estoqueAgregado != null ? `${money.format(item.estoqueAgregado)} (agregado)` : "—"; return <TableRow key={`${item.codigo}-${item.filial}`}><TableCell>{item.filial}</TableCell><TableCell className="font-bold text-slate-950">{item.codigo}</TableCell><TableCell className="max-w-xs">{item.descricao}</TableCell><TableCell className="whitespace-nowrap">{item.costStatus === "SEM_BASE_CUSTO" ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600" title="Item sem custo nos meses do período selecionado">Sem base de custo</span> : item.curve ? <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-extrabold text-sky-800" title={`Curva ABC ${item.curve} vinculada por filial + código agregado`}>{item.curve}</span> : <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800" title="Item sem vínculo com a Curva ABC carregada">Sem curva</span>}</TableCell>{periods.map((p, i) => { const val = series[i]; const v = variationPct(series[i + 1], series[i]); return <TableCell key={p}><p className="whitespace-nowrap">{val == null ? "—" : money.format(val)}</p>{i < periods.length - 1 && <p className={`whitespace-nowrap text-xs font-semibold ${v == null ? "text-slate-400" : v > 0 ? "text-rose-700" : v < 0 ? "text-emerald-700" : "text-slate-600"}`}>{v == null ? "—" : pct(v)}</p>}</TableCell>; })}<TableCell className="whitespace-nowrap font-bold">{item.variacaoPercent == null ? "—" : pct(item.variacaoPercent)}</TableCell>{benchmark?.ipcaPercent != null && <TableCell className={`whitespace-nowrap font-semibold ${vsIpca == null ? "text-slate-400" : vsIpca > 0 ? "text-rose-700" : vsIpca < 0 ? "text-emerald-700" : "text-slate-600"}`}>{vsIpca == null ? "—" : `${vsIpca > 0 ? "+" : ""}${number.format(vsIpca)}`}</TableCell>}<TableCell className="whitespace-nowrap">{item.consumoMedioMensal == null ? "—" : money.format(item.consumoMedioMensal)}</TableCell><TableCell className={`whitespace-nowrap font-semibold ${(item.impactoEstimado ?? 0) > 0 ? "text-rose-700" : (item.impactoEstimado ?? 0) < 0 ? "text-emerald-700" : "text-slate-600"}`}>{item.impactoEstimado == null ? "—" : money.format(item.impactoEstimado)}</TableCell><TableCell className="whitespace-nowrap text-xs">{estoqueTexto}</TableCell><TableCell className="max-w-xs text-xs font-medium text-slate-600">{item.costStatus === "SEM_BASE_CUSTO" ? "Sem base de custo no período." : sugestaoDeAcao(item, periods, limitesEfetivos)}</TableCell></TableRow>; }) : <TableRow><TableCell colSpan={6 + periods.length + 4} className="h-24 text-center text-sm font-medium text-slate-500">Nenhum item encontrado para este critério.</TableCell></TableRow>}</TableBody></Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-5 sm:p-7"><p className="text-sm font-semibold text-slate-600">Página {itens.data?.pagina ?? grid.pagina} de {totalPaginas}{itens.data ? ` · ${itens.data.total.toLocaleString("pt-BR")} itens` : ""}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={(itens.data?.pagina ?? grid.pagina) <= 1 || itens.isFetching} onClick={() => setGrid(prev => ({ ...prev, pagina: Math.max(1, prev.pagina - 1) }))}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><Button size="sm" variant="outline" disabled={(itens.data?.pagina ?? grid.pagina) >= totalPaginas || itens.isFetching} onClick={() => setGrid(prev => ({ ...prev, pagina: prev.pagina + 1 }))}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
    </section>}
  </div>;
}