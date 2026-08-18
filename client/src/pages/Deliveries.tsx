import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateInput, toDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { CalendarCheck2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { EmptyRow, PageHeading } from "./Suppliers";

type DeliveryStatus = "pendente" | "recebido";
const statusOptions: DeliveryStatus[] = ["pendente", "recebido"];

export default function Deliveries() {
  const utils = trpc.useUtils();
  const { data: orders = [] } = trpc.logistics.purchaseOrders.list.useQuery();
  const { data: deliveries = [], isLoading } = trpc.logistics.deliveries.list.useQuery();
  const [form, setForm] = useState({ purchaseOrderId: "", expectedAt: "", actualAt: "", status: "pendente" as DeliveryStatus });
  const [updates, setUpdates] = useState<Record<number, { actualAt: string; status: DeliveryStatus }>>({});
  const create = trpc.logistics.deliveries.create.useMutation({
    onSuccess: async () => { await utils.logistics.deliveries.list.invalidate(); await utils.logistics.dashboard.invalidate(); await utils.logistics.reports.list.invalidate(); setForm({ purchaseOrderId: "", expectedAt: "", actualAt: "", status: "pendente" }); toast.success("Entrega registrada."); },
    onError: error => toast.error(error.message),
  });
  const update = trpc.logistics.deliveries.update.useMutation({
    onSuccess: async () => { await utils.logistics.deliveries.list.invalidate(); await utils.logistics.dashboard.invalidate(); await utils.logistics.reports.list.invalidate(); toast.success("Recebimento atualizado."); },
    onError: error => toast.error(error.message),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); create.mutate({ purchaseOrderId: Number(form.purchaseOrderId), expectedAt: toDate(form.expectedAt), actualAt: form.actualAt ? toDate(form.actualAt) : undefined, status: form.status }); };

  return <div className="page-wrap">
    <PageHeading eyebrow="Recebimentos" title="Entregas" description="Vincule entregas aos pedidos e compare as datas prevista e realizada." />
    <section className="sc-surface p-5 sm:p-7"><form className="grid gap-4 lg:grid-cols-[1fr_180px_180px_160px_auto] lg:items-end" onSubmit={submit}><label className="grid gap-2"><Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Pedido</Label><select className="control" value={form.purchaseOrderId} onChange={e => setForm({ ...form, purchaseOrderId: e.target.value })} required><option value="" disabled>Selecione</option>{orders.map(order => <option value={order.id} key={order.id}>#{order.id} — {order.supplierName}</option>)}</select></label><label className="grid gap-2"><Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Data prevista</Label><Input type="date" value={form.expectedAt} onChange={e => setForm({ ...form, expectedAt: e.target.value })} required /></label><label className="grid gap-2"><Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Data realizada</Label><Input type="date" value={form.actualAt} onChange={e => setForm({ ...form, actualAt: e.target.value })} /></label><label className="grid gap-2"><Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Status</Label><select className="control" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as DeliveryStatus })}>{statusOptions.map(status => <option key={status}>{status}</option>)}</select></label><Button type="submit" disabled={create.isPending || orders.length === 0} className="bg-slate-950 text-white hover:bg-slate-800"><CalendarCheck2 className="mr-2 h-4 w-4" />Registrar entrega</Button></form></section>
    <section className="sc-surface mt-5 overflow-hidden"><div className="border-b border-slate-100 px-5 py-5 sm:px-7"><h2 className="text-base font-extrabold tracking-tight text-slate-950">Entregas e recebimentos</h2></div><Table><TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Fornecedor</TableHead><TableHead>Prevista</TableHead><TableHead>Realizada</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{!isLoading && deliveries.length === 0 && <EmptyRow columns={6} text="Nenhuma entrega registrada." />}{deliveries.map(delivery => { const current = updates[delivery.id] ?? { status: delivery.status, actualAt: formatDateInput(delivery.actualAt) }; return <TableRow key={delivery.id}><TableCell className="font-bold text-slate-950">#{delivery.purchaseOrderId}</TableCell><TableCell className="font-semibold">{delivery.supplierName}</TableCell><TableCell>{formatDate(delivery.expectedAt)}</TableCell><TableCell><Input aria-label={`Data realizada da entrega ${delivery.id}`} className="h-8 w-36 text-xs" type="date" value={current.actualAt} onChange={e => setUpdates({ ...updates, [delivery.id]: { ...current, actualAt: e.target.value } })} /></TableCell><TableCell><select aria-label={`Status da entrega ${delivery.id}`} className="control h-8 w-28 text-xs" value={current.status} onChange={e => setUpdates({ ...updates, [delivery.id]: { ...current, status: e.target.value as DeliveryStatus } })}>{statusOptions.map(status => <option key={status}>{status}</option>)}</select></TableCell><TableCell><div className="flex items-center gap-2"><Badge className={current.status === "recebido" ? "bg-[#dcead9] text-slate-700" : "bg-[#f3dfc4] text-slate-700"}>{current.status}</Badge><Button size="sm" variant="ghost" className="h-8 px-2 text-xs font-bold" disabled={update.isPending} onClick={() => update.mutate({ id: delivery.id, status: current.status, actualAt: current.actualAt ? toDate(current.actualAt) : undefined })}>Salvar</Button></div></TableCell></TableRow>; })}</TableBody></Table></section>
  </div>;
}
