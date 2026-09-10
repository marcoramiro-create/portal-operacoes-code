import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ChartNoAxesCombined, ChevronDown, ChevronRight, ChevronUp, Download, FileUp, Lightbulb, Sparkles, Store, Tags, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLocation } from "wouter";

type FilterState = { branches: string[]; curve: string; productType: string; mrp: string; family: string; subfamily: string };
// P2 (09/09/2026): drill-down — Resumo › Filial › Família › Item.
type DrillState = { branch?: string; family?: string };
type AnalyticsRow = { label: string; salesValue13M: number; stockValue: number; turnover: number; coverageDays: number; excessValue: number };
type ItemRow = { id: string; code: string; description: string; branch: string; curve: string; turnover: number; coverageDays: number; stock: number; stockValue: number; ultimaCompra: string | null; pedidos: number; consumoMensal: number; productType: string };
type EvolutionRow = { importId: string; fileName: string; importedAt: string; turnover: number; salesValue13M: number; stockValue: number };

function readPreference(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(`portal-analytics-${key}`);
  return value === null ? fallback : value === "true";
}
// P3 (10/09/2026): filtros preservados ao recarregar a página.
function readFilters(): FilterState {
  const fallback: FilterState = { branches: [], curve: "all", productType: "all", mrp: "all", family: "all", subfamily: "all" };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem("portal-analytics-filters");
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<FilterState>;
    return {
      branches: parsed.branches ?? [],
      curve: parsed.curve ?? "all",
      productType: parsed.productType ?? "all",
      mrp: parsed.mrp ?? "all",
      family: parsed.family ?? "all",
      subfamily: parsed.subfamily ?? "all",
    };
  } catch {
    return fallback;
  }
}
// P2 (09/09/2026): KPIs consolidados = Σ estoque ÷ Σ CD (regra aprovada).
function computeKpis(rows: Array<{ salesValue13M: number; stockValue: number; coverageDays: number; excessValue: number }>) {
  const stockValue = rows.reduce((acc, r) => acc + r.stockValue, 0);
  const salesValue = rows.reduce((acc, r) => acc + r.salesValue13M, 0);
  const excessValue = rows.reduce((acc, r) => acc + r.excessValue, 0);
  const cdSum = rows.reduce((acc, r) => acc + (r.coverageDays > 0 ? r.stockValue / r.coverageDays : 0), 0);
  const coverage = cdSum > 0 ? stockValue / cdSum : 0;
  const turnover = stockValue > 0 ? salesValue / stockValue : 0;
  return { stockValue, salesValue, excessValue, coverage, turnover };
}
// P3 (10/09/2026): ordenação genérica de tabelas (números de verdade, não texto).
function sortRows<T>(rows: T[], key: keyof T | null, dir: "asc" | "desc"): T[] {
  if (!key) return rows;
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult;
    return String(av).localeCompare(String(bv), "pt-BR") * mult;
  });
}
function useTableSort<T>(rows: T[], defaultKey: keyof T | null = null, defaultDir: "asc" | "desc" = "desc") {
  const [key, setKey] = useState<keyof T | null>(defaultKey);
  const [dir, setDir] = useState<"asc" | "desc">(defaultDir);
  const toggle = (k: keyof T) => {
    if (key === k) setDir(d => (d === "asc" ? "desc" : "asc"));
    else { setKey(k); setDir("desc"); }
  };
  const sorted = useMemo(() => sortRows(rows, key, dir), [rows, key, dir]);
  return { sorted, key, dir, toggle };
}
// P3 (10/09/2026): cabeçalho clicável com indicador de sentido.
function SortableHeader({ label, sortKey, activeKey, dir, onToggle, align = "left" }: { label: string; sortKey: string; activeKey: string | null; dir: "asc" | "desc"; onToggle: (key: string) => void; align?: "left" | "right" }) {
  const active = activeKey === sortKey;
  return (
    <button type="button" onClick={() => onToggle(sortKey)} className={`group inline-flex items-center gap-1 text-xs font-extrabold uppercase tracking-[0.08em] ${align === "right" ? "w-full justify-end" : ""}`}>
      {label}
      <span className={`text-[9px] ${active ? "text-slate-900" : "text-slate-300 group-hover:text-slate-500"}`}>{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
    </button>
  );
}
// P3 (10/09/2026): exporta a tabela atual para CSV (Excel pt-BR, separador ;).
function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const content = "\uFEFF" + [headers.join(";"), ...rows.map(r => r.join(";"))].join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
// P3 (10/09/2026): rótulo da carga = somente a data; data+hora só se houver 2 cargas no mesmo dia.
function loadLabel(imp: { id: number; importedAt: string }, all: Array<{ id: number; importedAt: string }>) {
  const date = new Date(imp.importedAt);
  const day = date.toLocaleDateString("pt-BR");
  const sameDay = all.filter(o => o.id !== imp.id && new Date(o.importedAt).toLocaleDateString("pt-BR") === day).length > 0;
  if (sameDay) return `${day} ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  return day;
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [filtersState, setFiltersState] = useState<FilterState>(readFilters);
  const [drill, setDrill] = useState<DrillState>({});
  const [cardMetric, setCardMetric] = useState<"lowCoverage" | "stockValue" | "excess" | "withoutSales" | null>(null);
  const [cardPage, setCardPage] = useState(1);
  const [cardSort, setCardSort] = useState("stockValue");
  const [cardDir, setCardDir] = useState<"asc" | "desc">("desc");
  const [compareImportId, setCompareImportId] = useState<number | null>(null);
  const [showFamily, setShowFamily] = useState(() => readPreference("show-family", false));
  const [showSubfamily, setShowSubfamily] = useState(() => readPreference("show-subfamily", false));
  const [showAi, setShowAi] = useState(() => readPreference("show-ai", false));
  const [dashboardView, setDashboardView] = useState<"overview" | "analysis">("overview");
  const [itemsPage, setItemsPage] = useState(1);
  const [showHistory, setShowHistory] = useState(false);
  // P3 (10/09/2026): barra compacta fixa quando os cards saem da tela.
  const [stickyMetrics, setStickyMetrics] = useState(false);
  const [stickyCollapsed, setStickyCollapsed] = useState(false);

  useEffect(() => { window.localStorage.setItem("portal-analytics-show-family", String(showFamily)); }, [showFamily]);
  useEffect(() => { window.localStorage.setItem("portal-analytics-show-subfamily", String(showSubfamily)); }, [showSubfamily]);
  useEffect(() => { window.localStorage.setItem("portal-analytics-show-ai", String(showAi)); }, [showAi]);
  useEffect(() => { window.localStorage.setItem("portal-analytics-filters", JSON.stringify(filtersState)); }, [filtersState]);
  useEffect(() => { setItemsPage(1); }, [filtersState.branches, filtersState.curve, filtersState.productType, filtersState.mrp, filtersState.family, filtersState.subfamily, drill.branch, drill.family]);
  // P3 (10/09/2026): detecta quando o bloco de cards sai da tela para fixar a barra compacta.
  useEffect(() => {
    if (dashboardView !== "overview") { setStickyMetrics(false); return; }
    const el = document.getElementById("metrics-anchor");
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setStickyMetrics(!entry.isIntersecting), { rootMargin: "-72px 0px 0px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [dashboardView]);

  const { data: imports = [] } = trpc.analytics.imports.useQuery();
  const selectedImportId = undefined;
  // P2 (09/09/2026): o drill entra no input — KPIs, cards e tabelas reagem ao contexto navegado.
  const input = useMemo(() => ({
    importId: selectedImportId,
    branches: drill.branch ? [drill.branch] : filtersState.branches.length > 0 ? filtersState.branches : undefined,
    curve: filtersState.curve === "all" ? undefined : filtersState.curve as "A" | "B" | "C" | "D" | "E",
    productType: filtersState.productType === "all" ? undefined : filtersState.productType as "ME" | "PE",
    mrp: filtersState.mrp === "all" ? undefined : filtersState.mrp as "Sim" | "Não",
    family: drill.family ?? (filtersState.family === "all" ? undefined : filtersState.family),
    subfamily: filtersState.subfamily === "all" ? undefined : filtersState.subfamily,
  }), [filtersState, selectedImportId, drill]);
  const { data: filters } = trpc.analytics.filterOptions.useQuery({ importId: selectedImportId });
  const evolutionInput = useMemo(() => { const { importId: _importId, ...rest } = input; return rest; }, [input]);
  const { data, isLoading } = trpc.analytics.dashboard.useQuery(input);
  const hasImport = Boolean(data?.currentImport);
  const { data: evolution = [] } = trpc.analytics.evolution.useQuery(evolutionInput);
  // P2 (09/09/2026): segunda carga para comparação lado a lado.
  const compareInput = useMemo(() => (compareImportId ? { ...input, importId: compareImportId } : null), [input, compareImportId]);
  const { data: comparison } = trpc.analytics.dashboard.useQuery(compareInput ?? undefined, { enabled: Boolean(compareInput) });
  const itemInput = useMemo(() => ({ page: itemsPage, branches: input.branches, curve: input.curve, productType: input.productType, mrp: input.mrp, family: input.family, subfamily: input.subfamily }), [itemsPage, input]);
  const { data: itemPage } = trpc.analytics.items.useQuery(itemInput, { enabled: hasImport });
  const cardInput = useMemo(() => cardMetric ? ({ metric: cardMetric, page: cardPage, sort: cardSort as any, dir: cardDir, branches: input.branches, curve: input.curve, productType: input.productType, mrp: input.mrp, family: input.family, subfamily: input.subfamily }) : undefined, [cardMetric, cardPage, cardSort, cardDir, input]);
  const { data: cardItems = [], isLoading: isCardLoading } = trpc.analytics.cardItems.useQuery(cardInput, { enabled: Boolean(cardInput && hasImport) });
  const aiInput = useMemo(() => ({ page: itemsPage, branches: input.branches, curve: input.curve, productType: input.productType, mrp: input.mrp, family: input.family, subfamily: input.subfamily }), [itemsPage, input]);
  const aiRecommendations = trpc.analytics.aiRecommendations.useMutation();
  useEffect(() => { if (showAi && hasImport) aiRecommendations.mutate(aiInput); }, [showAi, hasImport, aiInput]);

  const evolutionChartData = evolution.map(point => ({ ...point, label: new Date(point.importedAt).toLocaleDateString("pt-BR"), turnoverLabel: formatNumber(point.turnover, 2) }));
  const recommendationByCode = useMemo(() => new Map((aiRecommendations.data?.recommendations ?? []).map(item => [item.code, item])), [aiRecommendations.data]);
  const byBranch = data?.byBranch ?? [];
  const kpis = useMemo(() => computeKpis(byBranch), [byBranch]);
  const compareKpis = useMemo(() => computeKpis(comparison?.byBranch ?? []), [comparison]);

  // P3 (10/09/2026): ordenação das tabelas.
  const itemRows = useMemo(() => itemPage?.items ?? [], [itemPage]);
  const itemSort = useTableSort<ItemRow>(itemRows, null, "desc");
  const recommendedItems = useMemo(() => itemRows.filter(item => recommendationByCode.has(item.code)), [itemRows, recommendationByCode]);
  const aiSort = useTableSort<ItemRow>(recommendedItems, null, "desc");
  const evoRows = evolution as EvolutionRow[];
  const evoSort = useTableSort<EvolutionRow>(evoRows, null, "desc");

  const currentImportId = data?.currentImport?.id;
  const approvedImports = imports.filter(imp => imp.status === "approved");
  const comparableImports = approvedImports.filter(imp => imp.id !== currentImportId);
  const comparedImport = compareImportId ? approvedImports.find(imp => imp.id === compareImportId) : undefined;
  const activeChips: Array<{ label: string; onRemove: () => void }> = [];
  if (filtersState.branches.length > 0) activeChips.push({ label: `${filtersState.branches.length} unidade(s)`, onRemove: () => setFiltersState(s => ({ ...s, branches: [] })) });
  if (filtersState.curve !== "all") activeChips.push({ label: `Curva ${filtersState.curve}`, onRemove: () => setFiltersState(s => ({ ...s, curve: "all" })) });
  if (filtersState.productType !== "all") activeChips.push({ label: `Tipo ${filtersState.productType}`, onRemove: () => setFiltersState(s => ({ ...s, productType: "all" })) });
  if (filtersState.mrp !== "all") activeChips.push({ label: `MRP ${filtersState.mrp}`, onRemove: () => setFiltersState(s => ({ ...s, mrp: "all" })) });
  if (filtersState.family !== "all" && !drill.family) activeChips.push({ label: `Família ${filtersState.family}`, onRemove: () => setFiltersState(s => ({ ...s, family: "all" })) });
  if (filtersState.subfamily !== "all") activeChips.push({ label: `Subfamília ${filtersState.subfamily}`, onRemove: () => setFiltersState(s => ({ ...s, subfamily: "all" })) });
  const clearAll = () => { setFiltersState({ branches: [], curve: "all", productType: "all", mrp: "all", family: "all", subfamily: "all" }); setDrill({}); };
  const selectClass = "control";
  const comparisonRows = [
    { metric: "Vendas 13 meses", atual: kpis.salesValue, comparado: compareKpis.salesValue, invert: false, format: (v: number) => formatMoney(v) },
    { metric: "Estoque financeiro", atual: kpis.stockValue, comparado: compareKpis.stockValue, invert: true, format: (v: number) => formatMoney(v) },
    { metric: "Giro", atual: kpis.turnover, comparado: compareKpis.turnover, invert: false, format: (v: number) => formatNumber(v, 2) },
    { metric: "Cobertura (dias)", atual: kpis.coverage, comparado: compareKpis.coverage, invert: false, format: (v: number) => formatNumber(v, 1) },
    { metric: "Excedente", atual: kpis.excessValue, comparado: compareKpis.excessValue, invert: true, format: (v: number) => formatMoney(v) },
  ];
  const totalPages = Math.max(1, Math.ceil((itemPage?.total ?? 0) / 50));
  // P3 (10/09/2026): os 6 KPIs estratégicos exibidos na barra compacta fixa.
  const compactMetrics = [
    { label: "Cobertura", value: formatNumber(kpis.coverage, 1), unit: "dias" },
    { label: "Baixa cobertura", value: formatMoney(data?.quality.lowCoverageStockValue ?? 0) },
    { label: "Estoque fin.", value: formatMoney(kpis.stockValue) },
    { label: "Vendas", value: formatMoney(kpis.salesValue) },
    { label: "Excedente", value: formatMoney(kpis.excessValue) },
    { label: "Giro", value: formatNumber(kpis.turnover, 2), unit: "x" },
  ];
  const cardTotalPages = Math.max(1, Math.ceil((cardItems?.total ?? 0) / 200));
  const toggleCardSort = (key: string) => { if (cardSort === key) setCardDir(d => d === "asc" ? "desc" : "asc"); else { setCardSort(key); setCardDir("desc"); setCardPage(1); } };
  const cardTitle = cardMetric === "lowCoverage" ? "Baixa cobertura" : cardMetric === "stockValue" ? "Estoque financeiro" : cardMetric === "excess" ? "Excedente" : "Capital parado sem vendas";
  const cardColumns = cardMetric === "lowCoverage" ? ["product", "branch", "turnover", "curve", "stock", "stockValue", "pedidos", "coverageDays", "consumoMensal", "productType"] : cardMetric === "stockValue" ? ["product", "branch", "turnover", "curve", "stock", "stockValue", "consumoMensal", "coverageDays", "pedidos", "productType"] : ["product", "branch", "turnover", "curve", "stock", "stockValue", "coverageDays", "consumoMensal", "pedidos", "productType"];
  const cardLabels: Record<string, string> = { product: "Produto", branch: "Filial", turnover: "Giro", curve: "Curva", stock: "Estoque quantitativo", stockValue: "Estoque financeiro", pedidos: "Pedidos", coverageDays: "Cobertura (dias)", consumoMensal: "Consumo médio mensal", productType: "Tipo de produto" };
  const exportItems = () => downloadCsv(`itens_${drill.branch}_${drill.family}.csv`, ["Item", "Descrição", "Unidade", "Curva", "Giro", "Cobertura", "Estoque"], itemSort.sorted.map(i => [i.code, i.description, i.branch, i.curve, formatNumber(i.turnover, 2), `${formatNumber(i.coverageDays, 1)} dias`, formatMoney(i.stockValue)]));

  return <div className="mx-auto max-w-[1440px]">
    <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-8 text-white sm:px-9 sm:py-11">
      <span className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#9fc7ea] opacity-90" />
      <span className="absolute bottom-[-88px] right-[18%] h-48 w-48 rounded-[40%] bg-[#eab6c6] opacity-90" />
      <div className="relative max-w-3xl">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#b8d5ef]">Análise Protheus</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.055em] sm:text-5xl">Estoque em perspectiva.</h1>
        <p className="mt-4 max-w-2xl text-sm font-medium leading-6 text-slate-300 sm:text-base">Vendas, estoque financeiro, giro e excedente das unidades priorizadas.</p>
      </div>
    </section>
    <nav aria-label="Seções da análise Protheus" className="mt-6 grid max-w-lg grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
      <button type="button" onClick={() => setDashboardView("overview")} className={`rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${dashboardView === "overview" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>Visão operacional</button>
      <button type="button" onClick={() => setDashboardView("analysis")} className={`rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${dashboardView === "analysis" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>Histórico e decisões</button>
    </nav>
    {/* P2 (09/09/2026): breadcrumb do drill-down */}
    {(drill.branch || drill.family) && (
      <nav aria-label="Navegação em profundidade" className="mt-4 flex flex-wrap items-center gap-1.5 text-sm font-extrabold">
        <button type="button" onClick={() => setDrill({})} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900">Resumo</button>
        {drill.branch && <>
          <ChevronRight className="h-4 w-4 text-slate-400" />
          <button type="button" onClick={() => setDrill({ branch: drill.branch })} className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900">{drill.branch}</button>
        </>}
        {drill.family && <>
          <ChevronRight className="h-4 w-4 text-slate-400" />
          <span className="rounded-lg bg-slate-950 px-2 py-1 text-white">{drill.family}</span>
        </>}
      </nav>
    )}
    {!hasImport && !isLoading ? (
      <section className="sc-surface mt-7 flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="eyebrow">Primeira carga</p>
          <h2 className="mt-2 text-xl font-extrabold tracking-tight text-slate-950">Importe a planilha extraída do Protheus.</h2>
          <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-slate-500">Os indicadores serão atualizados a partir do arquivo Excel validado.</p>
        </div>
        <Button onClick={() => setLocation("/importar")} className="shrink-0 bg-slate-950 text-white hover:bg-slate-800"><FileUp className="mr-2 h-4 w-4" />Importar planilha</Button>
      </section>
    ) : <>
      {dashboardView === "overview" && <>
        {/* P3 (10/09/2026): barra compacta fixa no topo quando os cards saem da tela */}
        {stickyMetrics && hasImport && (
          <div className="sticky top-0 z-30 mt-3 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur sm:px-4">
            {stickyCollapsed ? (
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-400">Indicadores principais</p>
                <button type="button" onClick={() => setStickyCollapsed(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Expandir"><ChevronDown className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-4 overflow-x-auto">
                {compactMetrics.map(m => (
                  <div key={m.label} className="shrink-0">
                    <p className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-slate-400">{m.label}</p>
                    <p className="whitespace-nowrap text-sm font-extrabold text-slate-950">{m.value}{m.unit ? <span className="ml-1 text-[10px] font-bold text-slate-400">{m.unit}</span> : null}</p>
                  </div>
                ))}
                <button type="button" onClick={() => setStickyCollapsed(true)} className="ml-auto shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Recolher"><ChevronUp className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        )}
        {/* P3 (10/09/2026): 7 KPIs unificados num único bloco responsivo */}
        <section id="metrics-anchor" className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
          <MetricCard label="Cobertura consolidada" value={formatNumber(kpis.coverage, 1)} unit="dias" hint="Σ estoque ÷ Σ consumo diário" />
          <MetricCard label="Baixa cobertura" value={formatMoney(data?.quality.lowCoverageStockValue ?? 0)} hint="Estoque em itens com cobertura < 30 dias" onClick={() => setCardMetric("lowCoverage")} active={cardMetric === "lowCoverage"} />
          <MetricCard label="Estoque financeiro" value={formatMoney(kpis.stockValue)} hint="Valor em estoque da seleção" onClick={() => setCardMetric("stockValue")} active={cardMetric === "stockValue"} />
          <MetricCard label="Vendas acumuladas" value={formatMoney(kpis.salesValue)} hint="Vendas dos 13 meses da carga" />
          <MetricCard label="Excedente" value={formatMoney(kpis.excessValue)} hint="Acima do alvo da curva" onClick={() => setCardMetric("excess")} active={cardMetric === "excess"} />
          <MetricCard label="Giro" value={formatNumber(kpis.turnover, 2)} unit="vezes" hint="Vendas ÷ estoque" />
          <MetricCard label="Capital parado sem vendas" value={formatMoney(data?.quality.stockWithoutSalesValue ?? 0)} hint="Estoque financeiro com vendas acumuladas iguais a zero." emphasis="secondary" onClick={() => setCardMetric("withoutSales")} active={cardMetric === "withoutSales"} />
        </section>
        {cardMetric && <section className="sc-surface mt-5 overflow-hidden"><div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7"><div><p className="eyebrow">Detalhamento do indicador</p><h2 className="mt-2 text-base font-extrabold tracking-tight text-slate-950">{cardTitle}</h2></div><div className="flex items-center gap-3"><p className="text-xs font-semibold text-slate-500">{isCardLoading ? "Carregando…" : `${cardItems?.total ?? 0} itens`}</p><Button size="sm" variant="outline" onClick={() => setCardMetric(null)}>Fechar</Button></div></div><div className="max-h-[70vh] overflow-auto"><Table><TableHeader className="sticky top-0 z-10 bg-slate-100"><TableRow>{cardColumns.map(column => column === "product" ? <TableHead key={column}><SortableHeader label={cardLabels[column]} sortKey="code" activeKey={cardSort} dir={cardDir} onToggle={toggleCardSort} /></TableHead> : <TableHead key={column} className={!["branch","curve","productType"].includes(column) ? "text-right" : ""}><SortableHeader label={cardLabels[column]} sortKey={column} activeKey={cardSort} dir={cardDir} onToggle={toggleCardSort} align={!["branch","curve","productType"].includes(column) ? "right" : "left"} /></TableHead>)}</TableRow></TableHeader><TableBody>{!isCardLoading && (cardItems?.items ?? []).length === 0 && <TableRow><TableCell colSpan={cardColumns.length} className="h-24 text-center text-sm font-medium text-slate-500">Nenhum item encontrado para este indicador.</TableCell></TableRow>}{(cardItems?.items ?? []).map(item => <TableRow key={item.id}>{cardColumns.map(column => <TableCell key={column} className={!["product","branch","curve","productType"].includes(column) ? "text-right" : ""}>{column === "product" ? <><p className="font-bold text-slate-950">{item.code}</p><p className="max-w-72 truncate text-xs text-slate-500">{item.description}</p></> : column === "turnover" ? formatNumber(item.turnover, 2) : column === "stock" ? formatNumber(item.stock, 3) : column === "stockValue" ? formatMoney(item.stockValue) : column === "coverageDays" ? `${formatNumber(item.coverageDays, 1)} dias` : column === "consumoMensal" ? formatNumber(item.consumoMensal, 2) : column === "pedidos" ? formatNumber(item.pedidos, 3) : item[column as keyof typeof item]}</TableCell>)}</TableRow>)}</TableBody></Table></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-xs font-bold text-slate-600 sm:px-7"><span>Página {cardPage} de {cardTotalPages} · 200 itens por página</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={cardPage <= 1} onClick={() => setCardPage(p => p - 1)}>Anterior</Button><Button size="sm" variant="outline" disabled={cardPage >= cardTotalPages} onClick={() => setCardPage(p => p + 1)}>Próxima</Button></div></div></section>}
        {!drill.branch && <section className="sc-surface mt-5 p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="eyebrow">Unidades</p><h2 className="mt-2 text-base font-extrabold tracking-tight text-slate-950">Selecione as filiais da análise</h2></div>
            <Button size="sm" variant="outline" onClick={() => setFiltersState(s => ({ ...s, branches: s.branches.length === (filters?.branches ?? []).length ? [] : (filters?.branches ?? []) }))}>{filtersState.branches.length === (filters?.branches ?? []).length ? "Desmarcar todas" : "Selecionar todas"}</Button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{filters?.branches?.map(branch => { const selected = filtersState.branches.includes(branch); return <button key={branch} type="button" aria-pressed={selected} onClick={() => setFiltersState(s => ({ ...s, branches: selected ? s.branches.filter(b => b !== branch) : [...s.branches, branch] }))} className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm font-extrabold transition-all ${selected ? "border-slate-950 bg-slate-950 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}><span>{branch}</span><span className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${selected ? "border-white bg-white text-slate-950" : "border-slate-300"}`}>{selected ? "✓" : ""}</span></button>; })}</div>
        </section>}
        {activeChips.length > 0 && <section className="mt-4 flex flex-wrap items-center gap-2"><span className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Filtros:</span>{activeChips.map(chip => <button key={chip.label} type="button" onClick={chip.onRemove} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-slate-400"><span>{chip.label}</span><X className="h-3 w-3" /></button>)}<button type="button" onClick={clearAll} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50">Limpar tudo</button></section>}
        {!drill.family && <section className="sc-surface mt-5 p-5 sm:p-6"><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"><Filter label="Curva ABCDE" value={filtersState.curve} onChange={value => setFiltersState({ ...filtersState, curve: value })} options={filters?.curves ?? []} className={selectClass} allLabel="Todas as curvas" /><Filter label="Tipo de produto" value={filtersState.productType} onChange={value => setFiltersState({ ...filtersState, productType: value })} options={filters?.productTypes ?? []} className={selectClass} allLabel="Todos os tipos" /><Filter label="MRP" value={filtersState.mrp} onChange={value => setFiltersState({ ...filtersState, mrp: value })} options={filters?.mrps ?? ["Sim", "Não"]} className={selectClass} allLabel="Todos" />{!drill.branch && <Filter label="Família" value={filtersState.family} onChange={value => setFiltersState({ ...filtersState, family: value })} options={filters?.families ?? []} className={selectClass} allLabel="Todas as famílias" />}<Filter label="Subfamília" value={filtersState.subfamily} onChange={value => setFiltersState({ ...filtersState, subfamily: value })} options={filters?.subfamilies ?? []} className={selectClass} allLabel="Todas as subfamílias" /></div><div className="mt-5 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">{!drill.branch && <><DimensionToggle label="Família" checked={showFamily} onChange={setShowFamily} /><DimensionToggle label="Subfamília" checked={showSubfamily} onChange={setShowSubfamily} /></>}<DimensionToggle label="Análise IA" checked={showAi} onChange={setShowAi} icon={<Sparkles className="h-3.5 w-3.5" />} /><span className="ml-auto text-slate-500">Atualizado em <span className="font-extrabold text-slate-800">{data?.currentImport ? formatDate(data.currentImport.importedAt) : "—"}</span></span></div></section>}
        {!drill.branch && <section className="sc-surface mt-5 p-5 sm:p-6"><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Leitura operacional</p><h2 className="mt-2 text-xl font-extrabold tracking-tight text-slate-950">Sinais para decisão</h2></div><p className="max-w-xl text-xs font-semibold leading-5 text-slate-500">Indicadores calculados sobre a seleção atual e usados como contexto para comprar, pausar/reduzir ou acompanhar.</p></div><div className="mt-5 grid gap-3 lg:grid-cols-3"><Recommendation icon={AlertTriangle} title="Saneamento de parados" active={(data?.quality.stockWithoutSalesValue ?? 0) > 0} text="Priorize a validação de itens sem vendas: revise cadastro, demanda, transferência entre unidades e eventual descontinuação antes de novas compras." /><Recommendation icon={Lightbulb} title="Parâmetros de reposição" active={(data?.quality.lowCoverageStockValue ?? 0) > 0} text="Itens com cobertura inferior a 30 dias pedem revisão do MRP, do estoque de segurança e do prazo de abastecimento por unidade." /><Recommendation icon={ChartNoAxesCombined} title="Ação sobre excedentes" active={(data?.quality.excessStockValue ?? 0) > 0} text="Confronte excedente, curva ABCDE e giro para bloquear compras desnecessárias e avaliar redistribuição para unidades com maior consumo." /></div></section>}
        {/* P2 (09/09/2026): navegação em profundidade */}
        {!drill.branch && <section className="mt-5 grid gap-5 xl:grid-cols-2"><AnalyticsTable title="Giro por unidade" groupLabel="Unidade" icon={Store} rows={data?.byBranch ?? []} onRowClick={label => setDrill({ branch: label })} clickableHint="Clique numa unidade para ver as famílias" /><AnalyticsTable title="Giro por curva" groupLabel="Curva" icon={ChartNoAxesCombined} rows={data?.byCurve ?? []} />{showFamily && <AnalyticsTable title="Giro por família" groupLabel="Família" icon={Tags} rows={data?.byFamily ?? []} onRowClick={label => setDrill({ family: label })} clickableHint="Clique para ver os itens" />}{showSubfamily && <AnalyticsTable title="Giro por subfamília" groupLabel="Subfamília" icon={Tags} rows={data?.bySubfamily ?? []} />}</section>}
        {drill.branch && !drill.family && <section className="mt-5"><AnalyticsTable title={`Famílias da unidade ${drill.branch}`} groupLabel="Família" icon={Tags} rows={data?.byFamily ?? []} onRowClick={label => setDrill({ branch: drill.branch, family: label })} clickableHint="Clique numa família para ver os itens" /></section>}
        {drill.branch && drill.family && <section className="sc-surface mt-5 overflow-hidden"><div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7"><div><p className="eyebrow">Itens</p><h2 className="mt-2 text-base font-extrabold tracking-tight text-slate-950">Itens da família “{drill.family}” na unidade {drill.branch}</h2></div><p className="text-xs font-semibold text-slate-500">{(itemPage?.items ?? []).length} itens nesta página · {itemPage?.total ?? 0} no total da família.</p><Button size="sm" variant="outline" onClick={exportItems}><Download className="mr-1.5 h-3.5 w-3.5" />Exportar</Button></div><Table><TableHeader><TableRow><TableHead><SortableHeader label="Item" sortKey="code" activeKey={itemSort.key as string | null} dir={itemSort.dir} onToggle={k => itemSort.toggle(k as keyof ItemRow)} /></TableHead><TableHead><SortableHeader label="Unidade" sortKey="branch" activeKey={itemSort.key as string | null} dir={itemSort.dir} onToggle={k => itemSort.toggle(k as keyof ItemRow)} /></TableHead><TableHead><SortableHeader label="Curva" sortKey="curve" activeKey={itemSort.key as string | null} dir={itemSort.dir} onToggle={k => itemSort.toggle(k as keyof ItemRow)} /></TableHead><TableHead className="text-right"><SortableHeader label="Giro" sortKey="turnover" activeKey={itemSort.key as string | null} dir={itemSort.dir} onToggle={k => itemSort.toggle(k as keyof ItemRow)} align="right" /></TableHead><TableHead className="text-right"><SortableHeader label="Cobertura" sortKey="coverageDays" activeKey={itemSort.key as string | null} dir={itemSort.dir} onToggle={k => itemSort.toggle(k as keyof ItemRow)} align="right" /></TableHead><TableHead className="text-right"><SortableHeader label="Estoque" sortKey="stockValue" activeKey={itemSort.key as string | null} dir={itemSort.dir} onToggle={k => itemSort.toggle(k as keyof ItemRow)} align="right" /></TableHead></TableRow></TableHeader><TableBody>{itemSort.sorted.length === 0 && <TableRow><TableCell colSpan={6} className="h-24 text-center text-sm font-medium text-slate-500">Nenhum item encontrado para a família selecionada.</TableCell></TableRow>}{itemSort.sorted.map(item => <TableRow key={item.id}><TableCell><p className="font-bold text-slate-950">{item.code}</p><p className="max-w-72 truncate text-xs text-slate-500">{item.description}</p></TableCell><TableCell>{item.branch}</TableCell><TableCell>{item.curve}</TableCell><TableCell className="text-right">{formatNumber(item.turnover, 2)}</TableCell><TableCell className="text-right">{formatNumber(item.coverageDays, 1)} dias</TableCell><TableCell className="text-right">{formatMoney(item.stockValue)}</TableCell></TableRow>)}</TableBody></Table><div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-xs font-bold text-slate-600 sm:px-7"><span>página {itemPage?.page ?? itemsPage} de {totalPages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={(itemPage?.page ?? itemsPage) <= 1} onClick={() => setItemsPage(page => page - 1)}>Anterior</Button><Button size="sm" variant="outline" disabled={(itemPage?.page ?? itemsPage) >= totalPages} onClick={() => setItemsPage(page => page + 1)}>Próxima</Button></div></div></section>}
      </>}
      {dashboardView === "analysis" && <>
        {/* P2 (09/09/2026): comparação lado a lado de cargas; P3: datas nos seletores */}
        {comparableImports.length > 0 && <section className="sc-surface mt-5 overflow-hidden"><div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7"><div><p className="eyebrow">Comparação de cargas</p><h2 className="mt-2 text-base font-extrabold tracking-tight text-slate-950">Atual vs. versão anterior</h2></div><p className="max-w-xl text-xs font-semibold leading-5 text-slate-500">Mesmos filtros aplicados sobre duas cargas aprovadas, com variação percentual.</p></div><div className="px-5 py-4 sm:px-7"><label className="grid max-w-md gap-2"><span className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Comparar com</span><select className={selectClass} value={compareImportId ?? ""} onChange={event => setCompareImportId(event.target.value ? Number(event.target.value) : null)}><option value="">Selecione uma versão anterior…</option>{comparableImports.map(imp => <option key={imp.id} value={imp.id}>{loadLabel(imp, approvedImports)}</option>)}</select></label>{compareImportId && comparedImport && comparison && <Table className="mt-4"><TableHeader><TableRow><TableHead>Indicador</TableHead><TableHead className="text-right">Carga atual</TableHead><TableHead className="text-right">{loadLabel(comparedImport, approvedImports)}</TableHead><TableHead className="text-right">Variação</TableHead></TableRow></TableHeader><TableBody>{comparisonRows.map(row => { const pct = row.comparado === 0 ? (row.atual === 0 ? 0 : 100) : ((row.atual - row.comparado) / Math.abs(row.comparado)) * 100; const good = row.invert ? pct <= 0 : pct >= 0; return <TableRow key={row.metric}><TableCell className="font-bold text-slate-950">{row.metric}</TableCell><TableCell className="text-right">{row.format(row.atual)}</TableCell><TableCell className="text-right">{row.format(row.comparado)}</TableCell><TableCell className="text-right"><span className={`font-extrabold ${pct === 0 ? "text-slate-400" : good ? "text-emerald-600" : "text-rose-600"}`}>{pct > 0 ? "▲" : pct < 0 ? "▼" : "•"} {formatNumber(Math.abs(pct), 1)}%</span></TableCell></TableRow>; })}</TableBody></Table>}</div></section>}
        <section className="sc-surface mt-5 overflow-hidden"><button type="button" onClick={() => setShowHistory(v => !v)} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 text-left sm:px-7"><div><p className="eyebrow">Série histórica</p><h2 className="mt-2 text-base font-extrabold tracking-tight text-slate-950">Carga ativa: {data?.currentImport?.versionName ?? "—"}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{evolution.length} versão(ões) aprovada(s) · {data?.currentImport ? formatDate(data.currentImport.importedAt) : "—"}</p></div><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#dcebf7] text-slate-950">{showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span></button>{showHistory && <><div className="h-72 px-3 py-5 sm:px-7">{evolutionChartData.length > 0 ? <ResponsiveContainer width="100%" height="100%"><LineChart data={evolutionChartData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" /><YAxis tick={{ fontSize: 11 }} stroke="#64748b" tickFormatter={value => formatNumber(Number(value), 1)} /><Tooltip formatter={value => [formatNumber(Number(value), 2), "Giro"]} labelFormatter={label => `Atualizado em ${label}`} contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 12 }} /><Line type="monotone" dataKey="turnover" stroke="#0f172a" strokeWidth={3} dot={{ r: 4, fill: "#9fc7ea", stroke: "#0f172a", strokeWidth: 2 }} activeDot={{ r: 6 }} /></LineChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm font-medium text-slate-500">Nenhuma versão histórica encontrada para os filtros selecionados.</div>}</div><Table><TableHeader><TableRow><TableHead><SortableHeader label="Versão" sortKey="fileName" activeKey={evoSort.key as string | null} dir={evoSort.dir} onToggle={k => evoSort.toggle(k as keyof EvolutionRow)} /></TableHead><TableHead><SortableHeader label="Data" sortKey="importedAt" activeKey={evoSort.key as string | null} dir={evoSort.dir} onToggle={k => evoSort.toggle(k as keyof EvolutionRow)} /></TableHead><TableHead className="text-right"><SortableHeader label="Giro" sortKey="turnover" activeKey={evoSort.key as string | null} dir={evoSort.dir} onToggle={k => evoSort.toggle(k as keyof EvolutionRow)} align="right" /></TableHead><TableHead className="text-right"><SortableHeader label="Vendas" sortKey="salesValue13M" activeKey={evoSort.key as string | null} dir={evoSort.dir} onToggle={k => evoSort.toggle(k as keyof EvolutionRow)} align="right" /></TableHead><TableHead className="text-right"><SortableHeader label="Estoque" sortKey="stockValue" activeKey={evoSort.key as string | null} dir={evoSort.dir} onToggle={k => evoSort.toggle(k as keyof EvolutionRow)} align="right" /></TableHead></TableRow></TableHeader><TableBody>{evoSort.sorted.length === 0 && <TableRow><TableCell colSpan={5} className="h-24 text-center text-sm font-medium text-slate-500">Nenhuma versão histórica encontrada para os filtros selecionados.</TableCell></TableRow>}{evoSort.sorted.map(point => <TableRow key={point.importId}><TableCell className="font-bold text-slate-950">{point.fileName}</TableCell><TableCell>{formatDate(point.importedAt)}</TableCell><TableCell className="text-right">{formatNumber(point.turnover, 2)}</TableCell><TableCell className="text-right">{formatMoney(point.salesValue13M)}</TableCell><TableCell className="text-right">{formatMoney(point.stockValue)}</TableCell></TableRow>)}</TableBody></Table></>}</section>
        {showAi && <section className="sc-surface mt-5 overflow-hidden"><div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7"><div><p className="eyebrow">Decisão assistida</p><h2 className="mt-2 text-base font-extrabold tracking-tight text-slate-950">Recomendação de compras por item</h2></div><p className="text-xs font-semibold text-slate-500">A IA interpreta somente os dados reais da seleção atual. Revise a recomendação antes de executar qualquer compra.</p></div>{aiRecommendations.isPending ? <div className="p-7 text-sm font-semibold text-slate-500">Analisando os itens selecionados…</div> : aiRecommendations.error ? <div className="p-7 text-sm font-semibold text-rose-700">Não foi possível gerar a análise agora. Os indicadores calculados continuam disponíveis.</div> : <><Table><TableHeader><TableRow><TableHead><SortableHeader label="Item" sortKey="code" activeKey={aiSort.key as string | null} dir={aiSort.dir} onToggle={k => aiSort.toggle(k as keyof ItemRow)} /></TableHead><TableHead><SortableHeader label="Unidade" sortKey="branch" activeKey={aiSort.key as string | null} dir={aiSort.dir} onToggle={k => aiSort.toggle(k as keyof ItemRow)} /></TableHead><TableHead className="text-right"><SortableHeader label="Giro" sortKey="turnover" activeKey={aiSort.key as string | null} dir={aiSort.dir} onToggle={k => aiSort.toggle(k as keyof ItemRow)} align="right" /></TableHead><TableHead className="text-right"><SortableHeader label="Cobertura" sortKey="coverageDays" activeKey={aiSort.key as string | null} dir={aiSort.dir} onToggle={k => aiSort.toggle(k as keyof ItemRow)} align="right" /></TableHead><TableHead className="text-right"><SortableHeader label="Estoque" sortKey="stockValue" activeKey={aiSort.key as string | null} dir={aiSort.dir} onToggle={k => aiSort.toggle(k as keyof ItemRow)} align="right" /></TableHead><TableHead>Recomendação</TableHead></TableRow></TableHeader><TableBody>{aiSort.sorted.map(item => { const recommendation = recommendationByCode.get(item.code); return <TableRow key={item.id}><TableCell><p className="font-bold text-slate-950">{item.code}</p><p className="max-w-72 truncate text-xs text-slate-500">{item.description}</p></TableCell><TableCell>{item.branch}</TableCell><TableCell className="text-right">{formatNumber(item.turnover, 2)}</TableCell><TableCell className="text-right">{formatNumber(item.coverageDays, 1)} dias</TableCell><TableCell className="text-right">{formatMoney(item.stockValue)}</TableCell><TableCell>{recommendation ? <div><span className={`rounded-full px-2 py-1 text-[10px] font-extrabold uppercase ${recommendation.action === "comprar" ? "bg-emerald-100 text-emerald-800" : recommendation.action === "pausar/reduzir" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{recommendation.action}</span><p className="mt-1 max-w-72 text-xs leading-5 text-slate-600">{recommendation.rationale}</p></div> : <span className="text-xs text-slate-400">Sem recomendação</span>}</TableCell></TableRow>; })}</TableBody></Table><div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-xs font-bold text-slate-600 sm:px-7"><span>{aiSort.sorted.length} recomendações · página {itemPage?.page ?? itemsPage} de {totalPages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={(itemPage?.page ?? itemsPage) <= 1} onClick={() => setItemsPage(page => page - 1)}>Anterior</Button><Button size="sm" variant="outline" disabled={(itemPage?.page ?? itemsPage) >= totalPages} onClick={() => setItemsPage(page => page + 1)}>Próxima</Button></div></div></>}</section>}
      </>}
    </>}</div>;
}
function Filter({ label, value, onChange, options, optionLabels, allLabel, className }: { label: string; value: string; onChange: (value: string) => void; options: string[]; optionLabels?: Record<string, string>; allLabel: string; className: string }) { return <label className="grid gap-2"><span className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">{label}</span><select className={className} value={value} onChange={event => onChange(event.target.value)}><option value="all">{allLabel}</option>{options.map(option => <option value={option} key={option}>{optionLabels?.[option] ?? (option || "Não informado")}</option>)}</select></label>; }
function DimensionToggle({ label, checked, onChange, icon }: { label: string; checked: boolean; onChange: (value: boolean) => void; icon?: ReactNode }) { return <button type="button" aria-pressed={checked} onClick={() => onChange(!checked)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-extrabold transition-all ${checked ? "border-slate-950 bg-slate-950 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>{icon}<span className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${checked ? "border-white bg-white text-slate-950" : "border-slate-300"}`}>{checked ? "✓" : ""}</span>Mostrar {label.toLowerCase()}</button>; }
// P3 (10/09/2026): card unificado (KPI + qualidade) com tooltip na explicação.
function MetricCard({ label, value, unit, hint, emphasis = "primary", onClick, active = false }: { label: string; value: string; unit?: string; hint: string; emphasis?: "primary" | "secondary"; onClick?: () => void; active?: boolean }) { return <article title={hint} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={e => { if (onClick && (e.key === "Enter" || e.key === " ")) onClick(); }} className={`rounded-2xl border p-4 ${onClick ? "cursor-pointer transition hover:-translate-y-0.5 hover:border-slate-400" : ""} ${active ? "border-slate-950 ring-2 ring-slate-200" : "border-slate-100"} ${emphasis === "primary" ? "bg-white shadow-sm" : "bg-slate-50"}`}><p className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">{label}</p><p className={`mt-3 font-extrabold tracking-tight text-slate-950 ${emphasis === "primary" ? "text-2xl" : "text-xl"}`}>{value}{unit ? <span className="ml-1 text-sm font-bold text-slate-400">{unit}</span> : null}</p><p className="mt-2 text-[11px] font-medium leading-4 text-slate-400">{hint}{onClick ? " Clique para detalhar." : ""}</p></article>; }
function Recommendation({ icon: Icon, title, active, text }: { icon: typeof AlertTriangle; title: string; active: boolean; text: string }) { return <article className={`rounded-2xl border p-4 ${active ? "border-[#f0c3cf] bg-[#fff8fa]" : "border-slate-100 bg-white"}`}><div className="flex items-center gap-2"><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-[#f1ccd7] text-slate-950" : "bg-slate-100 text-slate-500"}`}><Icon className="h-4 w-4" /></span><p className="text-sm font-extrabold text-slate-800">{title}</p></div><p className="mt-3 text-xs font-medium leading-5 text-slate-600">{text}</p><p className="mt-3 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{active ? "Sinal presente na seleção" : "Sem sinal na seleção"}</p></article>; }
// P3 (10/09/2026): tabela analítica com ordenação por cabeçalho e exportação CSV.
function AnalyticsTable({ title, groupLabel, icon: Icon, rows, onRowClick, clickableHint }: { title: string; groupLabel: string; icon: typeof Store; rows: AnalyticsRow[]; onRowClick?: (label: string) => void; clickableHint?: string }) {
  const sort = useTableSort<AnalyticsRow>(rows, null, "desc");
  const handleToggle = (k: string) => sort.toggle(k as keyof AnalyticsRow);
  const exportRows = () => downloadCsv(`${title.replace(/\s+/g, "_")}.csv`, [groupLabel, "Giro", "Vendas", "Estoque", "Cobertura", "Excedente"], sort.sorted.map(r => [r.label, formatNumber(r.turnover, 2), formatMoney(r.salesValue13M), formatMoney(r.stockValue), `${formatNumber(r.coverageDays, 1)} dias`, formatMoney(r.excessValue)]));
  return <section className="sc-surface overflow-hidden"><div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-7"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#dcebf7] text-slate-950"><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h2 className="text-base font-extrabold tracking-tight text-slate-950">{title}</h2>{clickableHint ? <p className="text-[11px] font-semibold text-slate-400">{clickableHint}</p> : null}</div><Button size="sm" variant="outline" onClick={exportRows}><Download className="mr-1.5 h-3.5 w-3.5" />Exportar</Button></div><Table><TableHeader><TableRow><TableHead><SortableHeader label={groupLabel} sortKey="label" activeKey={sort.key as string | null} dir={sort.dir} onToggle={handleToggle} /></TableHead><TableHead className="text-right"><SortableHeader label="Giro" sortKey="turnover" activeKey={sort.key as string | null} dir={sort.dir} onToggle={handleToggle} align="right" /></TableHead><TableHead className="text-right"><SortableHeader label="Vendas" sortKey="salesValue13M" activeKey={sort.key as string | null} dir={sort.dir} onToggle={handleToggle} align="right" /></TableHead><TableHead className="text-right"><SortableHeader label="Estoque" sortKey="stockValue" activeKey={sort.key as string | null} dir={sort.dir} onToggle={handleToggle} align="right" /></TableHead><TableHead className="text-right"><SortableHeader label="Cobertura" sortKey="coverageDays" activeKey={sort.key as string | null} dir={sort.dir} onToggle={handleToggle} align="right" /></TableHead><TableHead className="text-right"><SortableHeader label="Excedente" sortKey="excessValue" activeKey={sort.key as string | null} dir={sort.dir} onToggle={handleToggle} align="right" /></TableHead></TableRow></TableHeader><TableBody>{sort.sorted.length === 0 && <TableRow><TableCell colSpan={6} className="h-28 text-center text-sm font-medium text-slate-500">Nenhum dado encontrado para os filtros selecionados.</TableCell></TableRow>}{sort.sorted.map(row => <TableRow key={row.label} className={onRowClick ? "cursor-pointer hover:bg-slate-50" : undefined} onClick={onRowClick ? () => onRowClick(row.label) : undefined}><TableCell className="max-w-48 font-bold text-slate-950">{row.label}{onRowClick ? <ChevronRight className="ml-1 inline h-3.5 w-3.5 text-slate-400" /> : null}</TableCell><TableCell className="text-right">{formatNumber(row.turnover, 2)}</TableCell><TableCell className="text-right">{formatMoney(row.salesValue13M)}</TableCell><TableCell className="text-right">{formatMoney(row.stockValue)}</TableCell><TableCell className="text-right">{formatNumber(row.coverageDays, 1)} dias</TableCell><TableCell className="text-right">{formatMoney(row.excessValue)}</TableCell></TableRow>)}</TableBody></Table></section>;
}