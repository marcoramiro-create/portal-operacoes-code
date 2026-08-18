import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { EmptyRow, PageHeading } from "./Suppliers";

export default function Reports() {
  const { data: entries = [], isLoading } = trpc.logistics.reports.list.useQuery();
  const { data: suppliers = [] } = trpc.logistics.suppliers.list.useQuery();
  const [filters, setFilters] = useState({ from: "", to: "", supplierId: "all", category: "all" });
  const categories = Array.from(new Set(suppliers.map(supplier => supplier.category)));
  const filteredEntries = useMemo(() => entries.filter(entry => {
    const occurredAt = new Date(entry.occurredAt);
    if (filters.from && occurredAt < new Date(`${filters.from}T00:00:00`)) return false;
    if (filters.to && occurredAt > new Date(`${filters.to}T23:59:59`)) return false;
    if (filters.supplierId !== "all" && entry.supplierId !== Number(filters.supplierId)) return false;
    if (filters.category !== "all" && entry.category !== filters.category) return false;
    return true;
  }), [entries, filters]);

  return <div className="page-wrap">
    <PageHeading eyebrow="Rastreabilidade" title="Relatórios" description="Consulte o histórico de movimentações por período, fornecedor e categoria." />
    <section className="sc-surface p-5 sm:p-7"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="grid gap-2"><Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Período inicial</Label><Input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></label><label className="grid gap-2"><Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Período final</Label><Input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></label><label className="grid gap-2"><Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Fornecedor</Label><select className="control" value={filters.supplierId} onChange={e => setFilters({ ...filters, supplierId: e.target.value })}><option value="all">Todos</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="grid gap-2"><Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Categoria</Label><select className="control" value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}><option value="all">Todas</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label></div></section>
    <section className="sc-surface mt-5 overflow-hidden"><div className="border-b border-slate-100 px-5 py-5 sm:px-7"><h2 className="text-base font-extrabold tracking-tight text-slate-950">Histórico de movimentações</h2></div><Table><TableHeader><TableRow><TableHead>Registro</TableHead><TableHead>Movimentação</TableHead><TableHead>Fornecedor</TableHead><TableHead>Categoria</TableHead><TableHead>Data</TableHead></TableRow></TableHeader><TableBody>{!isLoading && filteredEntries.length === 0 && <EmptyRow columns={5} text="Nenhuma movimentação encontrada para os filtros selecionados." />}{filteredEntries.map(entry => <TableRow key={entry.id}><TableCell><Badge variant="secondary" className="bg-[#e9edf0] text-slate-700">{entry.record}</Badge></TableCell><TableCell className="font-semibold text-slate-950">{entry.detail}</TableCell><TableCell>{entry.supplierName ?? "—"}</TableCell><TableCell>{entry.category ?? "—"}</TableCell><TableCell>{formatDate(entry.occurredAt)}</TableCell></TableRow>)}</TableBody></Table></section>
  </div>;
}
