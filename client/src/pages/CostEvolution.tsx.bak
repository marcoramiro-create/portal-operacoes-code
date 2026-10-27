import OneDriveImportSource from "@/components/OneDriveImportSource";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, BarChart3, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Filter, LoaderCircle, RotateCcw, Search, UploadCloud, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
type Segment = "auto_parts" | "industry";
const config = {
  auto_parts: { label: "Autopeças", importNode: "importacoes-custos-autopecas", description: "Peças das unidades de autopeças" },
  industry: { label: "Indústria", importNode: "importacoes-custos-industria", description: "Materiais e peças da indústria" },
} as const;
// REGRA DE DINHEIRO DO PROJETO: NUNCA exibir "R$". Totais com 2 casas;
// valores da evolução (mensais) com 4 casas.
const money2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money4 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
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
// Combo multi-termo: todas as palavras digitadas devem aparecer no código OU na
// descrição. Teclado no PC: ↑↓ navegam, Enter seleciona (ou aplica como busca),
// Esc fecha. Celular: lista rolável + ação "aplicar texto como busca" no rodapé.
function AgregadoCombobox({ options, value, onSelect, onBuscaTexto, loading }: {
  options: { cod_agregado: string; descricao: string | null }[];
  value: string;
  onSelect: (value: string) => void;
  onBuscaTexto: (texto: string) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(-1);
  const selecionado = options.find(option => option.cod_agregado === value) ?? null;
  const filtered = useMemo(() => {
    const termos = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!termos.length) return options.slice(0, 50);
    const match = (texto: string) => termos.every(t => texto.includes(t));
    return options.filter(option => match(option.cod_agregado.toLowerCase()) || match((option.descricao ?? "").toLowerCase())).slice(0, 50);
  }, [options, query]);
  if (value) {
    return <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="min-w-0 flex-1"><p className="text-sm font-extrabold text-slate-950">{value}</p>{selecionado?.descricao && <p className="mt-0.5 text-xs font-medium leading-5 text-slate-600">{trunc(selecionado.descricao, 120)}</p>}</div>
      <button type="button" title="Limpar seleção e digitar outro agregado" className="mt-0.5 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" onClick={() => onSelect("")}><X className="h-4 w-4" /></button>
    </div>;
  }
  const escolher = (option: { cod_agregado: string }) => { onSelect(option.cod_agregado); setQuery(""); setOpen(false); setHighlight(-1); };
  const aplicarBusca = () => { if (query.trim()) { onBuscaTexto(query.trim()); setQuery(""); setOpen(false); setHighlight(-1); } };
  return <div className="relative">
    <Input
      value={query}
      placeholder={loading ? "Carregando…" : "Digite o código ou a descrição do agregado…"}
      onChange={event => { setQuery(event.target.value); setOpen(true); setHighlight(-1); }}
      onFocus={() => setOpen(true)}
      onBlur={() => setTimeout(() => setOpen(false), 150)}
      onKeyDown={event => {
        if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setHighlight(h => Math.min(h + 1, filtered.length - 1)); }
        else if (event.key === "ArrowUp") { event.preventDefault(); setHighlight(h => Math.max(h - 1, -1)); }
        else if (event.key === "Enter") {
          if (open && highlight >= 0 && filtered[highlight]) { event.preventDefault(); escolher(filtered[highlight]); }
          else if (query.trim()) { event.preventDefault(); aplicarBusca(); }
        }
        else if (event.key === "Escape") { setOpen(false); setHighlight(-1); }
      }}
      inputMode="search"
    />
    {open && <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
      {filtered.map((option, index) => <button key={option.cod_agregado} type="button" className={`block w-full px-3 py-2 text-left text-sm ${index === highlight ? "bg-slate-100" : "hover:bg-slate-100"}`} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setHighlight(index)} onClick={() => escolher(option)}><span className="font-extrabold text-slate-950">{option.cod_agregado}</span>{option.descricao ? <span className="text-slate-600"> · {trunc(option.descricao, 60)}</span> : null}</button>)}
      {filtered.length === 0 && query.trim() !== "" && <p className="px-3 py-2 text-sm font-medium text-slate-500">Nenhum agregado encontrado para "{query.trim()}".</p>}
      {options.length > 50 && query.trim() === "" && <p className="px-3 py-2 text-xs font-medium text-slate-400">Digite para filtrar os {options.length.toLocaleString("pt-BR")} agregados.</p>}
      {query.trim() !== "" && <button type="button" className="block w-full border-t border-slate-100 px-3 py-2 text-left text-xs font-bold text-sky-700 hover:bg-sky-50" onMouseDown={event => event.preventDefault()} onClick={aplicarBusca}><Search className="mr-1.5 inline h-3.5 w-3.5" />Aplicar "{query.trim()}" como busca nos itens</button>}
    </div>}
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
type CurveCode = "A" | "B" | "C" | "D" | "E";
// Eixo Curva independente do Critério no grid — itens de outra curva JAMAIS
// aparecem. Curvas D/E existem apenas no Autopeças.
type CurvaSelecao = "todas" | CurveCode;
type Limites = { A: number; B: number; C: number; D: number; E: number };
// B-v11: novos limites padrão da régua — A 3,00 · B 3,50 · C/D/E 4,00.
const LIMITES_PADRAO: Limites = { A: 3, B: 3.5, C: 4, D: 4, E: 4 };
type CurveSummary = { itemCount: number; itemsWithBase: number; averageVariationPercent: number | null; weightedVariationPercent?: number | null; estimatedImpact: number | null; highAlerts: number };
type BenchmarkReport = {
  internalInflationPercent?: number | null;
  weightedMonthlyVariationPercent?: number | null;
  ipcaPercent?: number | null;
  dolarVariationPercent?: number | null;
  indicesStatus?: { IPCA?: string; DOLAR?: string };
  indicesDetalhes?: { IPCA?: string; DOLAR?: string };
  byCurve?: Partial<Record<CurveCode, CurveSummary>>;
  diagnosticoBase?: { itensNaBase?: number; itensComBase?: number; itensExcluidos?: number; consumoSemPreco?: number };
};
type ItemRow = {
  codigo: string; descricao: string; filial: string; cod_agregado: string | null;
  curve?: CurveCode; costStatus?: string;
  estoque?: number | null; estoqueValor?: number | null; estoqueAgregado?: number | null;
  variacaoPercent?: number | null; impactoEstimado?: number | null; consumoMedioMensal?: number | null;
  consumoTotal?: number | null; consumoMedioQuantidade?: number | null; consumoTotalQuantidade?: number | null;
  meses: { period: string; custo_medio: number | null; quantidade_vendida?: number | null; valor_consumo?: number | null }[];
};
// Sine qua non: não existe item sem curva e não se exibe "sem base de custo".
type Criterio = "todos" | "alta" | "reducao" | "acima-limite";
// B-v12: ordenação por cabeçalho — filial, código, descrição, curva, variação
// e impacto, com direção crescente/decrescente alternada a cada clique.
type OrdenacaoItens = "impacto" | "variacao" | "codigo" | "descricao" | "filial" | "curva";
type DirecaoOrdenacao = "asc" | "desc";
const CRITERIO_LABELS: Record<Criterio, string> = { todos: "Todos os itens", alta: "Itens com alta", reducao: "Itens com redução", "acima-limite": "Itens acima do limite" };
const FILIAL_UNICA_INDUSTRY = "0105";
const chaveItem = (item: ItemRow) => `${item.codigo}|${item.filial ?? ""}`;
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
function temPrecoNoMes(item: ItemRow, period: string) {
  return item.meses.some(m => m.period === period && m.custo_medio != null && m.custo_medio !== 0);
}
function sugestaoDeAcao(item: ItemRow, periods: string[], limites: Limites) {
  const values = buildSeries(item, periods).filter((v): v is number => v != null);
  if (!values.length) return "Sem histórico de custo no período.";
  const first = values[0], last = values[values.length - 1];
  const v = variationPct(last, first);
  if (v == null) return "Sem variação comparável.";
  const limite = item.curve ? (limites[item.curve] ?? LIMITES_PADRAO[item.curve]) : 20;
  if (v > 0 && Math.abs(v) >= limite) return `Alta de ${number.format(v)}% no período (limite da régua: ${number.format(limite)}%). Sugestão: renegociar com o fornecedor.`;
  if (v < 0 && Math.abs(v) >= limite) return `Redução de ${number.format(Math.abs(v))}% no período (limite da régua: ${number.format(limite)}%). Sugestão: manter fornecedor atual.`;
  return `Variação de ${number.format(v)}% no período. Sem ação imediata.`;
}
export function CostEvolutionDashboard({ segment }: { segment: Segment }) {
  const details = config[segment];
  const isIndustry = segment === "industry";
  const utils = trpc.useUtils();
  const [filial, setFilial] = useState("");
  const [codAgregado, setCodAgregado] = useState("");
  const [descricao, setDescricao] = useState("");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [limitesTexto, setLimitesTexto] = useState({ A: "3", B: "3,5", C: "4", D: "4", E: "4" });
  const [exporting, setExporting] = useState(false);
  const [applied, setApplied] = useState<{ filial: string; codAgregado: string; descricao: string; periodoInicio: string; periodoFim: string; limitesAlerta: Partial<Limites> }>({ filial: "", codAgregado: "", descricao: "", periodoInicio: "", periodoFim: "", limitesAlerta: {} });
  const [runAnalysis, setRunAnalysis] = useState(false);
  // B-v12: estado do grid ganha filial rápida, ordenação e DIREÇÃO (cabeçalho clicável).
  const [grid, setGrid] = useState<{ open: boolean; curva: CurvaSelecao; criterio: Criterio; pagina: number; ordenacao: OrdenacaoItens; direcao: DirecaoOrdenacao; filial: string }>({ open: false, curva: "todas", criterio: "todos", pagina: 1, ordenacao: "impacto", direcao: "desc", filial: "todas" });
  const [expandido, setExpandido] = useState<string | null>(null);
  const [agregadoDetalhe, setAgregadoDetalhe] = useState<string | null>(null);
  const [mostrarGrafico, setMostrarGrafico] = useState(true);
  const gridRef = useRef<HTMLElement | null>(null);
  const periodos = trpc.costEvolution.periodos.useQuery({ segment }, { retry: false });
  const filiais = trpc.costEvolution.filiais.useQuery({ segment }, { retry: false, enabled: !isIndustry });
  const agregados = trpc.costEvolution.codAgregadosDetalhados.useQuery({ segment }, { retry: false });
  // Botão "Atualizar índices" REMOVIDO — os índices oficiais (IBGE/BCB) se
  // completam sozinhos no servidor a cada análise.
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
    searchType: applied.descricao ? ("contem" as const) : undefined,
    limitesAlerta: applied.limitesAlerta,
  }), [segment, isIndustry, applied]);
  const analise = trpc.costEvolution.analise.useQuery(input, { retry: false, enabled: runAnalysis });
  const itensInput = useMemo(() => ({
    ...input,
    filial: grid.filial !== "todas" ? grid.filial : input.filial,
    curvaFiltro: grid.curva === "todas" ? undefined : grid.curva,
    criterio: grid.criterio,
    ordenacao: grid.ordenacao,
    direcao: grid.direcao,
    pagina: grid.pagina,
    itensPorPagina: 50,
  }), [input, grid]);
  const itens = trpc.costEvolution.itensEvolutivos.useQuery(itensInput, { retry: false, enabled: runAnalysis && grid.open, placeholderData: prev => prev });
  const chartItems = trpc.costEvolution.itensEvolutivos.useQuery({ ...input, criterio: "todos" as const, ordenacao: "codigo" as const, direcao: "asc" as const, pagina: 1, itensPorPagina: 200 }, { retry: false, enabled: runAnalysis && Boolean(applied.codAgregado) });
  // B-v12: família do agregado — TODOS os itens do agregado do item clicado,
  // em qualquer filial, listados dentro do card de detalhe.
  const familia = trpc.costEvolution.itensEvolutivos.useQuery(
    { ...input, descricao: undefined, filial: undefined, codAgregado: agregadoDetalhe ?? undefined, criterio: "todos" as const, ordenacao: "codigo" as const, direcao: "asc" as const, pagina: 1, itensPorPagina: 100 },
    { retry: false, enabled: runAnalysis && Boolean(expandido && agregadoDetalhe), placeholderData: prev => prev },
  );
  const abrirDetalhe = (item: ItemRow) => {
    const chave = chaveItem(item);
    const proximo = expandido === chave ? null : chave;
    setExpandido(proximo);
    setAgregadoDetalhe(proximo ? (item.cod_agregado ?? item.codigo) : null);
    if (proximo) window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const fecharDetalhe = () => { setExpandido(null); setAgregadoDetalhe(null); };
  const aplicarFiltros = (sobrescrever?: { descricao?: string }) => {
    const nova = {
      filial: isIndustry ? "" : filial,
      codAgregado: sobrescrever?.descricao ? "" : codAgregado,
      descricao: sobrescrever?.descricao ?? descricao,
      periodoInicio, periodoFim, limitesAlerta,
    };
    if (sobrescrever?.descricao != null) setDescricao(sobrescrever.descricao);
    setApplied(nova);
    setRunAnalysis(true);
    setGrid(g => ({ ...g, open: false, curva: "todas", criterio: "todos", pagina: 1 }));
    fecharDetalhe();
    toast.success("Filtros aplicados.");
  };
  const limparBusca = () => {
    setDescricao("");
    setApplied(prev => ({ ...prev, descricao: "" }));
  };
  // Botão Limpar — reseta tudo e volta à janela padrão de 6 meses.
  const limparFiltros = () => {
    setFilial(""); setCodAgregado(""); setDescricao(""); setPeriodoInicio(""); setPeriodoFim("");
    setLimitesTexto({ A: "3", B: "3,5", C: "4", D: "4", E: "4" });
    setApplied({ filial: "", codAgregado: "", descricao: "", periodoInicio: "", periodoFim: "", limitesAlerta: {} });
    setRunAnalysis(false);
    setGrid(g => ({ ...g, open: false, curva: "todas", criterio: "todos", pagina: 1 }));
    fecharDetalhe();
    toast.success("Filtros limpos — janela padrão de 6 meses.");
  };
  const openGrid = (curva: CurvaSelecao, criterio: Criterio) => {
    setGrid(g => ({ ...g, open: true, curva, criterio, pagina: 1 }));
    fecharDetalhe();
    setTimeout(() => gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };
  // B-v12: clique no cabeçalho — mesma coluna alterna asc/desc; coluna nova
  // usa direção natural (variação/impacto desc; demais asc).
  const ordenarPor = (campo: OrdenacaoItens) => setGrid(prev => ({
    ...prev,
    ordenacao: campo,
    direcao: prev.ordenacao === campo ? (prev.direcao === "asc" ? "desc" : "asc") : (campo === "variacao" || campo === "impacto" ? "desc" : "asc"),
    pagina: 1,
  }));
  const thSort = (campo: OrdenacaoItens, label: string, title?: string) => (
    <TableHead>
      <button type="button" className="inline-flex items-center gap-1 hover:text-slate-950" title={title ?? `Ordenar por ${label.toLowerCase()} — clique alterna crescente/decrescente`} onClick={() => ordenarPor(campo)}>
        {label}
        {grid.ordenacao === campo && (grid.direcao === "asc" ? <ChevronUp className="h-3.5 w-3.5 text-sky-700" /> : <ChevronDown className="h-3.5 w-3.5 text-sky-700" />)}
      </button>
    </TableHead>
  );
  const analiseData = analise.data;
  const benchmark = analiseData?.benchmarkReport as BenchmarkReport | undefined;
  const periods: string[] = useMemo(() => (analiseData?.periodos ?? []).map((p: { period: string }) => p.period), [analiseData?.periodos]);
  const limitesEfetivos: Limites = (analiseData?.limites as Limites | undefined) ?? LIMITES_PADRAO;
  const curvasSegmento = isIndustry ? (["A", "B", "C"] as const) : (["A", "B", "C", "D", "E"] as const);
  const reguaLabel = curvasSegmento.map(curva => `${curva} ≥ ${number.format(limitesEfetivos[curva])}%`).join(" · ");
  const efetivoInicio = analiseData?.periodoEfetivoInicio as string | null | undefined;
  const efetivoFim = analiseData?.periodoEfetivoFim as string | null | undefined;
  // B-v12: o select exibe a ESCOLHA atual do usuário; sem escolha, mostra a
  // base efetiva. (No B-v11 o value ignorava a escolha e o select "voltava"
  // — causa do "não consigo selecionar o período" no celular.)
  const valorPeriodoInicio = periodoInicio || (runAnalysis && efetivoInicio ? efetivoInicio : "");
  const valorPeriodoFim = periodoFim || (runAnalysis && efetivoFim ? efetivoFim : "");
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
  const familiaList: ItemRow[] = (familia.data?.items ?? []) as ItemRow[];
  const itemDetalhe = expandido ? (pageItems.find(i => chaveItem(i) === expandido) ?? familiaList.find(i => chaveItem(i) === expandido)) : null;
  const totalPaginas = itens.data ? Math.max(1, Math.ceil(itens.data.total / itens.data.itensPorPagina)) : 1;
  const consumoSemPrecoCount = benchmark?.diagnosticoBase?.consumoSemPreco ?? 0;
  // Ordem de hooks: useMemo antes de qualquer retorno antecipado.
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
      const curvaFiltro = grid.curva === "todas" ? undefined : grid.curva;
      for (;;) {
        const data = await utils.costEvolution.itensEvolutivos.fetch({
          ...input,
          filial: grid.filial !== "todas" ? grid.filial : input.filial,
          curvaFiltro, criterio: grid.criterio, ordenacao: grid.ordenacao, direcao: grid.direcao,
          pagina, itensPorPagina: 200,
        });
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
      const header: string[] = ["Filial", "Código", "Descrição", "Agregado", "Curva"];
      periods.forEach((p, i) => {
        header.push(monthLabel(p));
        if (i < periods.length - 1) header.push(`Var ${monthLabel(p)}→${monthLabel(periods[i + 1])}`);
      });
      header.push("Variação total %", "vs IPCA (p.p.)", "vs Dólar (p.p.)", "Consumo médio mensal", "Consumo méd./mês (qtd.)", "Impacto estimado", "Estoque", "Estoque R$", "Sugestão de ação");
      const ipca = benchmark?.ipcaPercent ?? null;
      const dolar = benchmark?.dolarVariationPercent ?? null;
      const aoa: (string | number)[][] = [header];
      all.forEach(item => {
        const series = buildSeries(item, periods);
        const row: (string | number)[] = [item.filial, item.codigo, item.descricao, item.cod_agregado ?? "", item.curve ?? ""];
        periods.forEach((p, i) => {
          const val = series[i];
          row.push(val == null ? "" : Number(val.toFixed(4)));
          if (i < periods.length - 1) {
            const v = variationPct(series[i + 1], series[i]);
            row.push(v == null ? "" : Number((v / 100).toFixed(6)));
          }
        });
        const vsIpca = item.variacaoPercent != null && ipca != null ? Number((item.variacaoPercent - ipca).toFixed(2)) : "";
        const vsDolar = item.variacaoPercent != null && dolar != null ? Number((item.variacaoPercent - dolar).toFixed(2)) : "";
        row.push(item.variacaoPercent == null ? "" : Number(item.variacaoPercent.toFixed(2)), vsIpca, vsDolar, item.consumoMedioMensal == null ? "" : Number(item.consumoMedioMensal.toFixed(2)), item.consumoMedioQuantidade == null ? "" : Number(item.consumoMedioQuantidade.toFixed(2)), item.impactoEstimado == null ? "" : Number(item.impactoEstimado.toFixed(2)), item.estoque ?? "", item.estoqueValor == null ? "" : Number(item.estoqueValor.toFixed(2)), sugestaoDeAcao(item, periods, limitesEfetivos));
        aoa.push(row);
      });
      sheet.addRows(aoa);
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 22;
      sheet.columns.forEach((col: { width?: number }, index: number) => {
        col.width = index === 0 ? 10 : index === 1 ? 14 : index === 2 ? 50 : index === 3 ? 16 : index === 4 ? 8 : index >= header.length - 9 ? 18 : 14;
      });
      const firstMonthCol = 6;
      const lastMonthCol = firstMonthCol + periods.length * 2 - 2;
      for (let c = firstMonthCol; c <= lastMonthCol; c++) {
        const isValue = (c - firstMonthCol) % 2 === 0;
        sheet.getColumn(c).numFmt = isValue ? "#,##0.0000" : "+0.0000%;-0.0000%;0.0000%";
      }
      for (let c = header.length - 9; c <= header.length - 2; c++) sheet.getColumn(c).numFmt = "#,##0.00";
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
      const curvaTag = grid.curva === "todas" ? "todas-curvas" : `curva-${grid.curva.toLowerCase()}`;
      a.download = `evolucao-custos-${seg}-${curvaTag}-${CRITERIO_LABELS[grid.criterio].toLowerCase().replace(/\s+/g, "-")}-${stamp}.xlsx`;
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
  const colunasGrid = 6;
  const resumoFiltros = runAnalysis ? [`Período ${valorPeriodoInicio ? monthLabel(valorPeriodoInicio) : "—"} → ${valorPeriodoFim ? monthLabel(valorPeriodoFim) : "—"}`, isIndustry ? `Filial ${FILIAL_UNICA_INDUSTRY}` : (applied.filial ? `Filial ${applied.filial}` : "Todas as filiais"), applied.codAgregado ? `Agregado ${applied.codAgregado}` : null, applied.descricao ? `Busca "${applied.descricao}"` : null].filter(Boolean).join(" · ") : "";
  return <div className="page-wrap">
    <PageHeader eyebrow={`Suprimentos e estoques · ${details.label}`} title={`Evolução de custos de ${details.label.toLowerCase()}`} description={`Acompanhe a evolução mês a mês do custo médio de cada item, com impacto financeiro, régua de alerta configurável e comparativos oficiais (IPCA e dólar PTAX).`} />
    <section className="sc-surface p-5 sm:p-7">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500 md:col-span-1 xl:col-span-2">Período inicial<select className="control min-h-11 w-full" value={valorPeriodoInicio} onChange={event => setPeriodoInicio(event.target.value)}><option value="">Mais recente</option>{(periodos.data ?? []).map((p: { period: string }) => <option key={p.period} value={p.period}>{monthLabel(p.period)}{!applied.periodoInicio && runAnalysis && efetivoInicio === p.period ? " (padrão)" : ""}</option>)}</select></label>
        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500 md:col-span-1 xl:col-span-2">Período final<select className="control min-h-11 w-full" value={valorPeriodoFim} onChange={event => setPeriodoFim(event.target.value)}><option value="">Mais recente</option>{(periodos.data ?? []).map((p: { period: string }) => <option key={p.period} value={p.period}>{monthLabel(p.period)}{!applied.periodoFim && runAnalysis && efetivoFim === p.period ? " (padrão)" : ""}</option>)}</select></label>
        {isIndustry ? <div className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500 md:col-span-1 xl:col-span-2">Filial<div className="control flex items-center justify-between"><span className="font-extrabold text-slate-950">{FILIAL_UNICA_INDUSTRY}</span><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-emerald-700">única</span></div></div> : <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500 md:col-span-1 xl:col-span-2">Filial<select className="control min-h-11 w-full" value={filial} onChange={event => setFilial(event.target.value)}><option value="">Todas</option>{(filiais.data ?? []).map((f: { filial: string }) => <option key={f.filial} value={f.filial}>{f.filial}</option>)}</select></label>}
        <label className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500 md:col-span-2 xl:col-span-6">Item agregado<AgregadoCombobox options={(agregados.data ?? []) as { cod_agregado: string; descricao: string | null }[]} value={codAgregado} onSelect={setCodAgregado} onBuscaTexto={texto => aplicarFiltros({ descricao: texto })} loading={agregados.isLoading} /></label>
      </div>
      {applied.descricao && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800" title="Aplicada pelo rodapé da busca do agregado">Busca nos itens: "{applied.descricao}"</span><button type="button" className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200" onClick={limparBusca}><X className="h-3.5 w-3.5" />Limpar busca</button></div>}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-500"><span>Régua por curva (%)</span><div className="flex flex-wrap gap-1.5">{(["A", "B", "C", "D", "E"] as const).filter(curva => isIndustry ? curva !== "D" && curva !== "E" : true).map(curva => <label key={curva} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 py-1"><span className="text-[11px] font-extrabold text-slate-700">{curva}</span><input className="w-12 rounded border border-slate-200 px-1 py-0.5 text-right text-xs font-bold text-slate-950" inputMode="decimal" title="Valor entre 0 e 100" value={limitesTexto[curva]} onChange={event => setLimitesTexto(prev => ({ ...prev, [curva]: event.target.value }))} /><span className="text-[10px] font-semibold text-slate-500">%</span></label>)}</div></div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button variant="outline" onClick={limparFiltros} title="Limpa todos os filtros e volta à janela padrão de 6 meses"><RotateCcw className="mr-1.5 h-4 w-4" />Limpar</Button>
          <Button onClick={() => aplicarFiltros()} disabled={analise.isLoading} className="bg-slate-950 hover:bg-slate-800">{analise.isLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Filter className="mr-2 h-4 w-4" />}Filtrar</Button>
        </div>
      </div>
      {resumoFiltros && <p className="mt-3 text-xs font-semibold text-slate-500">{resumoFiltros}</p>}
    </section>
    <section className="mt-5 grid grid-cols-2 gap-3 bg-[#f2f4f5] py-3 md:sticky md:top-0 md:z-10 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
      {analyzing ? <div className="sc-surface col-span-full flex items-center gap-3 p-4 text-sm font-semibold text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando análise…</div> : analise.error ? <div className="sc-surface col-span-full flex items-center gap-3 p-4 text-sm font-semibold text-rose-700">Falha na análise: {(analise.error as unknown as Error).message}. Copie esta mensagem e me envie.</div> : [
        ["Custo total", analiseData ? money2.format((analiseData.cards as { custoTotal: number }).custoTotal) : "0,00"],
        ["Variação ponderada", benchmark?.weightedMonthlyVariationPercent == null ? "—" : pct(benchmark.weightedMonthlyVariationPercent)],
        ["Itens com custo", analiseData ? (analiseData.cards as { comCusto: number }).comCusto.toLocaleString("pt-BR") : "0"],
        ["Itens com alta", analiseData ? (analiseData.cards as { alta: number }).alta.toLocaleString("pt-BR") : "0", "alta" as Criterio],
        ["Itens com redução", analiseData ? (analiseData.cards as { reducao: number }).reducao.toLocaleString("pt-BR") : "0", "reducao" as Criterio],
        ["Base de comparação", periods.length ? `${monthLabel(periods[0])} a ${monthLabel(periods[periods.length - 1])}` : "—"],
      ].map(([label, value, criterio]) => <div key={label as string} className={`sc-surface p-4${criterio ? " cursor-pointer transition hover:bg-slate-50" : ""}`} onClick={criterio ? () => openGrid("todas", criterio as Criterio) : undefined} title={criterio ? "Ver os itens no detalhe paginado (todas as curvas)" : undefined}><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-lg font-extrabold tracking-tight text-slate-950">{value}</p></div>)}
      {/* B-v12: diagnóstico da régua de ferro — item com consumo SEM preço é
          anomalia de origem; fica fora da análise e é EXIBIDO aqui. */}
      {!analyzing && !analise.error && consumoSemPrecoCount > 0 && <div className="sc-surface col-span-full flex items-start gap-2 border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{consumoSemPrecoCount.toLocaleString("pt-BR")} item(ns) com consumo mas SEM custo médio no período foram excluídos da análise — item sem custo não entra, nunca mais. Anomalia a tratar na origem.</div>}
    </section>
    {/* B-v12: DETALHE DO ITEM NO TOPO e CONGELADO ao rolar (como os cards de
        KPI). 8 cards compactos numa única linha no desktop; consumo méd. reais
        e quantidade JUNTOS; faixa mensal destaca os meses sem preço em âmbar;
        família do agregado listada e clicável. */}
    {itemDetalhe && (() => { const item = itemDetalhe; const vsIpca = item.variacaoPercent != null && benchmark?.ipcaPercent != null ? item.variacaoPercent - (benchmark.ipcaPercent as number) : null; const vsDolar = item.variacaoPercent != null && benchmark?.dolarVariationPercent != null ? item.variacaoPercent - (benchmark.dolarVariationPercent as number) : null; const serie = buildSeries(item, periods); const mesesSemPreco = periods.filter(p => !temPrecoNoMes(item, p)).length; const estoqueTexto = item.estoque != null || item.estoqueValor != null ? `${item.estoque != null ? number.format(item.estoque) : "—"}${item.estoqueValor != null ? ` · ${money2.format(item.estoqueValor)}` : ""}` : item.estoqueAgregado != null ? `${money2.format(item.estoqueAgregado)} (agregado)` : "—"; return <section className="sc-surface mt-5 p-4 sm:p-6 md:sticky md:top-[116px] md:z-[9]"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-base font-extrabold text-slate-950">Detalhe · {item.codigo}{item.filial ? ` · ${item.filial}` : ""}</h3><p className="mt-1 break-words text-sm font-medium leading-5 text-slate-600" title={item.descricao}>{trunc(item.descricao, 160)}</p>{item.curve && <span className="mt-1.5 inline-block rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sky-800">Curva {item.curve}</span>}</div><button type="button" className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200" onClick={fecharDetalhe}><X className="h-3.5 w-3.5" />Recolher</button></div><div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-slate-500">Item agregado</p><p className="mt-1 text-sm font-extrabold text-slate-950">{item.cod_agregado ?? "—"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-slate-500">vs IPCA (p.p.)</p><p className={`mt-1 text-sm font-extrabold ${vsIpca == null ? "text-slate-400" : vsIpca > 0 ? "text-rose-700" : "text-emerald-700"}`}>{vsIpca == null ? "—" : `${vsIpca > 0 ? "+" : ""}${number.format(vsIpca)}`}</p><p className="mt-0.5 text-[9px] font-semibold text-slate-400">IPCA: {benchmark?.ipcaPercent != null ? pct(benchmark.ipcaPercent) : "—"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-slate-500">vs Dólar (p.p.)</p><p className={`mt-1 text-sm font-extrabold ${vsDolar == null ? "text-slate-400" : vsDolar > 0 ? "text-rose-700" : "text-emerald-700"}`}>{vsDolar == null ? "—" : `${vsDolar > 0 ? "+" : ""}${number.format(vsDolar)}`}</p><p className="mt-0.5 text-[9px] font-semibold text-slate-400">Dólar PTAX: {benchmark?.dolarVariationPercent != null ? pct(benchmark.dolarVariationPercent) : "—"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-slate-500">Consumo méd./mês</p><p className="mt-1 text-sm font-extrabold text-slate-950">{item.consumoMedioMensal == null ? "—" : money2.format(item.consumoMedioMensal)}</p>{item.consumoMedioQuantidade != null && <p className="mt-0.5 whitespace-nowrap text-[9px] font-semibold text-slate-500">qtd. {number.format(item.consumoMedioQuantidade)}</p>}</div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-slate-500">Consumo do período</p><p className="mt-1 text-sm font-extrabold text-slate-950">{item.consumoTotal == null ? "—" : money2.format(item.consumoTotal)}</p>{item.consumoTotalQuantidade != null && <p className="mt-0.5 whitespace-nowrap text-[9px] font-semibold text-slate-500">qtd. {number.format(item.consumoTotalQuantidade)}</p>}</div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-slate-500">Impacto estimado</p><p className={`mt-1 text-sm font-extrabold ${(item.impactoEstimado ?? 0) > 0 ? "text-rose-700" : (item.impactoEstimado ?? 0) < 0 ? "text-emerald-700" : "text-slate-950"}`}>{item.impactoEstimado == null ? "—" : money2.format(item.impactoEstimado)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-slate-500">Estoque</p><p className="mt-1 whitespace-nowrap text-sm font-extrabold text-slate-950">{estoqueTexto}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-slate-500">Meses sem preço</p><p className="mt-1 text-sm font-extrabold text-slate-950">{mesesSemPreco} de {periods.length}</p></div></div><div className="mt-3"><p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-slate-500">Série mensal · variação colorida · meses sem preço em âmbar</p><div className="mt-2 flex gap-2 overflow-x-auto pb-2">{periods.map((p, i) => { const val = serie[i]; const temPreco = temPrecoNoMes(item, p); const v = temPreco && i < periods.length - 1 ? variationPct(serie[i + 1], serie[i]) : null; return <div key={p} className={`min-w-[104px] shrink-0 rounded-xl p-3${temPreco ? " bg-slate-50" : " border border-sky-200 bg-sky-50"}`}><p className={`text-[10px] font-extrabold ${temPreco ? "text-slate-500" : "text-sky-800"}`}>{monthLabel(p)}</p><p className={`mt-0.5 whitespace-nowrap text-xs font-extrabold ${temPreco ? "text-slate-950" : "text-sky-800"}`}>{temPreco ? (val == null ? "—" : money4.format(val)) : "—"}</p><p className={`whitespace-nowrap text-[10px] font-semibold ${!temPreco ? "text-sky-600" : i < periods.length - 1 ? (v == null ? "text-slate-400" : v > 0 ? "text-rose-700" : v < 0 ? "text-emerald-700" : "text-slate-600") : "text-transparent"}`}>{!temPreco ? (val == null ? "rep." : `rep. ${monthLabel(p)}`) : i < periods.length - 1 ? (v == null ? "—" : pct(v)) : "—"}</p></div>; })}</div></div>{agregadoDetalhe && familiaList.length > 0 && <div className="mt-4"><p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-slate-500">Itens do agregado {agregadoDetalhe} · {familiaList.length.toLocaleString("pt-BR")} — clique para trocar o detalhe</p><div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-100">{familiaList.map(f => { const chave = chaveItem(f); const atual = chave === expandido; return <button key={chave} type="button" className={`flex w-full flex-wrap items-center gap-2 border-b border-slate-50 px-3 py-2 text-left text-xs last:border-b-0 ${atual ? "bg-sky-50" : "hover:bg-slate-50"}`} onClick={() => abrirDetalhe(f)}><span className="font-extrabold text-slate-950">{f.codigo}</span>{!isIndustry && <span className="text-slate-500">Filial {f.filial}</span>}{f.curve && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-extrabold text-sky-800">Curva {f.curve}</span>}<span className="ml-auto whitespace-nowrap font-bold text-slate-950">{f.variacaoPercent == null ? "—" : pct(f.variacaoPercent)}</span><span className="whitespace-nowrap text-slate-600">{f.impactoEstimado == null ? "—" : money2.format(f.impactoEstimado)}</span></button>; })}</div></div>}</section>; })()}
    {runAnalysis && benchmark && <section className="sc-surface mt-5 overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
        <div><p className="eyebrow">Cruzamento gerencial</p><h2 className="mt-1 text-lg font-extrabold text-slate-950">Curva ABC na evolução de custos</h2><p className="mt-1 text-sm font-medium text-slate-500">Régua de alerta aplicada: {reguaLabel}. Clique em uma curva ou no número de itens acima do limite para ver o detalhe paginado — sempre restrito à curva clicada.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-500">Comparativos:</span>{benchmark.ipcaPercent != null && <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-extrabold text-sky-800" title="IPCA acumulado no período (IBGE)">IPCA {pct(benchmark.ipcaPercent)}</span>}{benchmark.dolarVariationPercent != null && <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-extrabold text-slate-700" title="Variação do dólar PTAX no período (BCB)">Dólar {pct(benchmark.dolarVariationPercent)}</span>}{benchmark.indicesStatus && Object.values(benchmark.indicesStatus).some(status => status === "indisponivel") && <span className="text-[10px] font-semibold text-amber-700">Fonte oficial indisponível — usando o último valor gravado.</span>}</div></div>
      </div>
      {curveRows.length > 0 && <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Curva</TableHead><TableHead>Itens</TableHead><TableHead>Variação ponderada</TableHead><TableHead>Impacto estimado</TableHead><TableHead title={`Itens da curva cuja variação do período passou da régua: ${reguaLabel}`}>Itens acima do limite</TableHead></TableRow></TableHeader><TableBody>{curveRows.map(([curve, summary]) => <TableRow key={curve}><TableCell><button type="button" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-800 transition hover:bg-sky-100 hover:text-sky-800" title={`Ver os itens da curva ${curve}`} onClick={() => openGrid(curve, "todos")}>{curve}</button></TableCell><TableCell>{summary.itemCount.toLocaleString("pt-BR")}</TableCell><TableCell>{summary.weightedVariationPercent == null ? "—" : pct(summary.weightedVariationPercent)}</TableCell><TableCell>{summary.estimatedImpact == null ? "—" : money2.format(summary.estimatedImpact)}</TableCell><TableCell>{summary.highAlerts > 0 ? <button type="button" className="font-extrabold text-rose-700 underline decoration-dotted underline-offset-2 hover:text-rose-900" title={`Ver os itens da curva ${curve} acima do limite`} onClick={() => openGrid(curve, "acima-limite")}>{summary.highAlerts.toLocaleString("pt-BR")}</button> : "0"}</TableCell></TableRow>)}</TableBody></Table></div>}
      {curveRows.length === 0 && <div className="p-5 text-sm font-medium text-slate-500 sm:p-7">O cruzamento ABC ainda não retornou curvas para este conjunto de filtros.</div>}
    </section>}
    {applied.codAgregado && chartData.length > 0 && <section className="sc-surface mt-5 p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#dcebf7] text-slate-950"><BarChart3 className="h-5 w-5" /></span><div><h2 className="text-lg font-extrabold text-slate-950">Evolução do agregado {applied.codAgregado}</h2><p className="mt-1 text-xs font-semibold text-slate-500">Uma linha por item{isIndustry ? "" : " e por filial"}. Meses sem preço usam o valor do mês anterior.</p></div></div><Button size="sm" variant="outline" onClick={() => setMostrarGrafico(valor => !valor)} title="Exibe ou recolhe o gráfico">{mostrarGrafico ? <ChevronUp className="mr-1.5 h-4 w-4" /> : <ChevronDown className="mr-1.5 h-4 w-4" />}{mostrarGrafico ? "Recolher gráfico" : "Exibir gráfico"}</Button></div>{mostrarGrafico && <div className="mt-6 h-80"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="period" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={value => money4.format(Number(value))} /><Tooltip formatter={value => money4.format(Number(value))} />{chartItemsList.map((item, idx) => <Line key={itemChartKey(item)} type="monotone" dataKey={itemChartKey(item)} name={`${item.codigo} · ${trunc(item.descricao, 40)}${item.filial && !isIndustry ? ` · Filial ${item.filial}` : ""}`} stroke={LINE_COLORS[idx % LINE_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />)}</LineChart></ResponsiveContainer></div>}</section>}
    {runAnalysis && !grid.open && <section className="sc-surface mt-5 flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7"><div><h2 className="text-lg font-extrabold text-slate-950">Evolução mês a mês por item</h2><p className="mt-1 text-sm font-medium text-slate-500">Abra o detalhe paginado para navegar pelos itens dos filtros atuais. Clique em uma linha: o detalhe abre no topo da tela, congelado ao rolar, com vs IPCA, vs Dólar, consumo e estoque.</p></div><Button variant="outline" onClick={() => openGrid("todas", "todos")}><BarChart3 className="mr-2 h-4 w-4" />Ver evolução por item</Button></section>}
    {runAnalysis && grid.open && <section ref={gridRef} className="sc-surface mt-5 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-7">
        <div><h2 className="text-lg font-extrabold text-slate-950">{grid.curva === "todas" ? "Todas as curvas" : `Curva ${grid.curva}`} · {CRITERIO_LABELS[grid.criterio]}</h2><p className="mt-1 text-sm font-medium text-slate-500">{itens.data ? `${itens.data.total.toLocaleString("pt-BR")} itens · ${itens.data.itensPorPagina} por página · clique na linha para o detalhe no topo` : "Carregando itens…"}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {!isIndustry && <select className="control h-9 w-36" value={grid.filial} onChange={event => setGrid(prev => ({ ...prev, filial: event.target.value, pagina: 1 }))} title="Filtro rápido de filial dentro do grid — sem reaplicar a análise"><option value="todas">Filial: todas</option>{(filiais.data ?? []).map((f: { filial: string }) => <option key={f.filial} value={f.filial}>Filial: {f.filial}</option>)}</select>}
          <select className="control h-9 w-40" value={grid.curva} onChange={event => setGrid(prev => ({ ...prev, curva: event.target.value as CurvaSelecao, pagina: 1 }))} title="Eixo da curva — itens de outra curva jamais aparecem"><option value="todas">Curva: todas</option>{curvasSegmento.map(curva => <option key={curva} value={curva}>Curva: {curva}</option>)}</select>
          <select className="control h-9 w-44" value={grid.criterio} onChange={event => setGrid(prev => ({ ...prev, criterio: event.target.value as Criterio, pagina: 1 }))} title="Critério dos itens"><option value="todos">Todos os itens</option><option value="alta">Itens com alta</option><option value="reducao">Itens com redução</option><option value="acima-limite">Itens acima do limite</option></select>
          <select className="control h-9 w-40" value={grid.ordenacao} onChange={event => setGrid(prev => ({ ...prev, ordenacao: event.target.value as OrdenacaoItens, direcao: (event.target.value === "variacao" || event.target.value === "impacto") ? "desc" : "asc", pagina: 1 }))}><option value="impacto">Ordenar: impacto</option><option value="variacao">Ordenar: variação</option><option value="codigo">Ordenar: código</option><option value="descricao">Ordenar: descrição</option><option value="filial">Ordenar: filial</option><option value="curva">Ordenar: curva</option></select>
          <Button size="sm" variant="outline" disabled={exporting} onClick={() => { exportXlsx(); }} title="Exporta todos os itens do critério atual">{exporting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Exportar</Button>
          <Button size="sm" variant="outline" onClick={() => setGrid(prev => ({ ...prev, open: false }))}><X className="mr-1.5 h-4 w-4" />Fechar</Button>
        </div>
      </div>
      {/* B-v12: rolagem INTERNA com altura limitada, cabeçalho fixo e colunas
          ordenáveis pelo cabeçalho (filial, código, descrição, curva, variação
          e impacto — asc/desc alternando a cada clique). B-v14: grid leve de
          6 colunas — as colunas de mês foram removidas, junto com o cabeçalho
          "var →" e a coluna Sugestão de ação. */}
      <div className="max-h-[65vh] min-h-[280px] overflow-auto">
        <Table><TableHeader className="sticky top-0 z-20 bg-white shadow-[0_1px_0_0_#e2e8f0]"><TableRow>{thSort("filial", "Filial")}{thSort("codigo", "Código")}{thSort("descricao", "Descrição")}{thSort("curva", "Curva ABC")}{thSort("variacao", "Variação total")}{thSort("impacto", "Impacto estimado")}</TableRow></TableHeader><TableBody>{itens.error ? <TableRow><TableCell colSpan={colunasGrid} className="h-24 text-center text-sm font-semibold text-rose-700">Falha ao carregar os itens: {(itens.error as unknown as Error).message}. Copie esta mensagem e me envie.</TableCell></TableRow> : itens.isLoading && !pageItems.length ? <TableRow><TableCell colSpan={colunasGrid} className="h-24 text-center text-sm font-medium text-slate-500"><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />Carregando itens…</TableCell></TableRow> : pageItems.length ? pageItems.map(item => { const chave = chaveItem(item); return <TableRow key={chave} className="cursor-pointer transition hover:bg-slate-50" onClick={() => abrirDetalhe(item)}><TableCell>{item.filial}</TableCell><TableCell className="font-bold text-slate-950">{item.codigo}</TableCell><TableCell className="max-w-xs"><p className="line-clamp-2" title={item.descricao}>{item.descricao}</p></TableCell><TableCell className="whitespace-nowrap">{item.curve ? <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-extrabold text-sky-800" title={`Curva ABC ${item.curve} vinculada por filial + código agregado`}>{item.curve}</span> : <span className="text-xs font-semibold text-slate-400" title="Sem curva vinculada — anomalia a corrigir na origem">—</span>}</TableCell><TableCell className="whitespace-nowrap font-bold">{item.variacaoPercent == null ? "—" : pct(item.variacaoPercent)}</TableCell><TableCell className={`whitespace-nowrap font-semibold ${(item.impactoEstimado ?? 0) > 0 ? "text-rose-700" : (item.impactoEstimado ?? 0) < 0 ? "text-emerald-700" : "text-slate-600"}`}>{item.impactoEstimado == null ? "—" : money2.format(item.impactoEstimado)}</TableCell></TableRow>; }) : <TableRow><TableCell colSpan={colunasGrid} className="h-24 text-center text-sm font-medium text-slate-500">Nenhum item encontrado para este critério.</TableCell></TableRow>}</TableBody></Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-5 sm:p-7"><p className="text-sm font-semibold text-slate-600">Página {itens.data?.pagina ?? grid.pagina} de {totalPaginas}{itens.data ? ` · ${itens.data.total.toLocaleString("pt-BR")} itens` : ""}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={(itens.data?.pagina ?? grid.pagina) <= 1 || itens.isFetching} onClick={() => setGrid(prev => ({ ...prev, pagina: Math.max(1, prev.pagina - 1) }))}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><Button size="sm" variant="outline" disabled={(itens.data?.pagina ?? grid.pagina) >= totalPaginas || itens.isFetching} onClick={() => setGrid(prev => ({ ...prev, pagina: prev.pagina + 1 }))}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
    </section>}
  </div>;
}