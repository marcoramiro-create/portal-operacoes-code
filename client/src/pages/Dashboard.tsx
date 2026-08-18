import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Boxes, ChartNoAxesCombined, CircleDollarSign, Clock3, FileUp, Store } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

const metrics = [
  { key: "sales13M", label: "Vendas acumuladas", icon: ChartNoAxesCombined, tone: "blue", format: (value: number) => formatNumber(value) },
  { key: "stock", label: "Estoque atual", icon: Boxes, tone: "pink", format: (value: number) => formatNumber(value) },
  { key: "coverageDays", label: "Cobertura média", icon: Clock3, tone: "blue", format: (value: number) => `${formatNumber(value, 1)} dias` },
  { key: "excessValue", label: "Excedente", icon: CircleDollarSign, tone: "pink", format: (value: number) => formatMoney(value) },
] as const;

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [branch, setBranch] = useState("all");
  const [curve, setCurve] = useState("all");
  const input = useMemo(() => ({ branch: branch === "all" ? undefined : branch, curve: curve === "all" ? undefined : curve as "A" | "B" | "C" | "D" | "E" }), [branch, curve]);
  const { data: filters } = trpc.analytics.filterOptions.useQuery();
  const { data, isLoading } = trpc.analytics.dashboard.useQuery(input);
  const hasImport = Boolean(data?.currentImport);

  return <div className="mx-auto max-w-[1440px]">
    <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-8 text-white sm:px-9 sm:py-11"><span className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#9fc7ea] opacity-90" /><span className="absolute bottom-[-88px] right-[18%] h-48 w-48 rounded-[40%] bg-[#eab6c6] opacity-90" /><div className="relative max-w-3xl"><p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#b8d5ef]">Análise Protheus</p><h1 className="mt-3 text-3xl font-extrabold tracking-[-0.055em] sm:text-5xl">Estoque em perspectiva.</h1><p className="mt-4 max-w-2xl text-sm font-medium leading-6 text-slate-300 sm:text-base">Vendas acumuladas, estoque, cobertura e excedente analisados por loja e curva ABCDE.</p></div></section>

    {!hasImport && !isLoading ? <section className="sc-surface mt-7 flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"><div><p className="eyebrow">Primeira carga</p><h2 className="mt-2 text-xl font-extrabold tracking-tight text-slate-950">Importe a planilha extraída do Protheus.</h2><p className="mt-2 max-w-xl text-sm font-medium leading-6 text-slate-500">Os indicadores serão atualizados a partir do arquivo Excel validado.</p></div><Button onClick={() => setLocation("/importar")} className="shrink-0 bg-slate-950 text-white hover:bg-slate-800"><FileUp className="mr-2 h-4 w-4" />Importar planilha</Button></section> : <>
      <section className="sc-surface mt-7 p-5 sm:p-6"><div className="grid gap-4 md:grid-cols-2"><label className="grid gap-2"><span className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Loja</span><select className="control" value={branch} onChange={event => setBranch(event.target.value)}><option value="all">Todas as lojas</option>{filters?.branches.map(option => <option value={option} key={option}>{option}</option>)}</select></label><label className="grid gap-2"><span className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Curva ABCDE</span><select className="control" value={curve} onChange={event => setCurve(event.target.value)}><option value="all">Todas as curvas</option>{filters?.curves.map(option => <option value={option} key={option}>{option}</option>)}</select></label></div><p className="mt-5 text-xs font-semibold text-slate-500">Última carga: <span className="text-slate-700">{data?.currentImport?.fileName}</span> em {formatDate(data?.currentImport?.importedAt)}.</p></section>
      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(metric => { const Icon = metric.icon; const value = data?.summary[metric.key] ?? 0; return <article className="sc-surface min-h-40 p-5" key={metric.key}><span className={`absolute -right-5 -top-6 h-20 w-20 rounded-full opacity-70 ${metric.tone === "blue" ? "bg-[#c8e0f3]" : "bg-[#f1ccd7]"}`} /><div className="relative flex h-full flex-col justify-between"><div className="flex items-start justify-between gap-3"><p className="max-w-[11rem] text-sm font-semibold leading-5 text-slate-600">{metric.label}</p><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm"><Icon className="h-4 w-4" /></span></div><p className="mt-7 text-3xl font-extrabold tracking-[-0.06em] text-slate-950">{isLoading ? "—" : metric.format(value)}</p></div></article>; })}</section>
      <section className="mt-5 grid gap-5 xl:grid-cols-2"><AnalyticsTable title="Indicadores por loja" icon={Store} rows={data?.byBranch ?? []} rowName="branch" /><AnalyticsTable title="Indicadores por curva" icon={ChartNoAxesCombined} rows={data?.byCurve ?? []} rowName="curve" /></section>
    </>}
  </div>;
}

function AnalyticsTable({ title, icon: Icon, rows, rowName }: { title: string; icon: typeof Store; rows: Array<{ branch?: string; curve?: string; sales13M: number; stock: number; coverageDays: number; excessValue: number }>; rowName: "branch" | "curve" }) {
  return <section className="sc-surface overflow-hidden"><div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-7"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#dcebf7] text-slate-950"><Icon className="h-4 w-4" /></span><h2 className="text-base font-extrabold tracking-tight text-slate-950">{title}</h2></div><Table><TableHeader><TableRow><TableHead>{rowName === "branch" ? "Loja" : "Curva"}</TableHead><TableHead>Vendas</TableHead><TableHead>Estoque</TableHead><TableHead>Cobertura</TableHead><TableHead>Excedente</TableHead></TableRow></TableHeader><TableBody>{rows.length === 0 && <TableRow><TableCell colSpan={5} className="h-28 text-center text-sm font-medium text-slate-500">Nenhum dado encontrado para os filtros selecionados.</TableCell></TableRow>}{rows.map(row => <TableRow key={row[rowName]}><TableCell>{rowName === "curve" ? <Badge className="bg-[#f1ccd7] text-slate-800">{row.curve}</Badge> : <span className="font-bold text-slate-950">{row.branch}</span>}</TableCell><TableCell>{formatNumber(row.sales13M)}</TableCell><TableCell>{formatNumber(row.stock)}</TableCell><TableCell>{formatNumber(row.coverageDays, 1)} dias</TableCell><TableCell>{formatMoney(row.excessValue)}</TableCell></TableRow>)}</TableBody></Table></section>;
}
