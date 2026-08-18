import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ClipboardPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { EmptyRow, PageHeading } from "./Suppliers";

const statusOptions = ["rascunho", "aprovado", "enviado", "recebido", "cancelado"] as const;
type PurchaseOrderStatus = (typeof statusOptions)[number];

const statusStyle: Record<PurchaseOrderStatus, string> = {
  rascunho: "bg-slate-100 text-slate-600",
  aprovado: "bg-[#dcebf7] text-slate-700",
  enviado: "bg-[#f3dfc4] text-slate-700",
  recebido: "bg-[#dcead9] text-slate-700",
  cancelado: "bg-[#f4d8dc] text-slate-700",
};

export default function PurchaseOrders() {
  const utils = trpc.useUtils();
  const { data: suppliers = [] } = trpc.logistics.suppliers.list.useQuery();
  const { data: orders = [], isLoading } = trpc.logistics.purchaseOrders.list.useQuery();
  const [supplierId, setSupplierId] = useState("");
  const [status, setStatus] = useState<PurchaseOrderStatus>("rascunho");
  const create = trpc.logistics.purchaseOrders.create.useMutation({
    onSuccess: async () => { await utils.logistics.purchaseOrders.list.invalidate(); await utils.logistics.dashboard.invalidate(); setSupplierId(""); setStatus("rascunho"); toast.success("Pedido de compra criado."); },
    onError: error => toast.error(error.message),
  });
  const updateStatus = trpc.logistics.purchaseOrders.updateStatus.useMutation({
    onSuccess: async () => { await utils.logistics.purchaseOrders.list.invalidate(); await utils.logistics.dashboard.invalidate(); await utils.logistics.reports.list.invalidate(); toast.success("Status atualizado."); },
    onError: error => toast.error(error.message),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate({ supplierId: Number(supplierId), status });
  };

  return <div className="page-wrap">
    <PageHeading eyebrow="Compras" title="Pedidos de compra" description="Crie pedidos vinculados aos fornecedores e acompanhe cada status." />
    <section className="sc-surface p-5 sm:p-7">
      <form className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end" onSubmit={submit}>
        <label className="grid gap-2"><Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Fornecedor</Label><select className="control" value={supplierId} onChange={e => setSupplierId(e.target.value)} required><option value="" disabled>Selecione</option>{suppliers.map(supplier => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select></label>
        <label className="grid gap-2"><Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Status</Label><select className="control" value={status} onChange={e => setStatus(e.target.value as PurchaseOrderStatus)}>{statusOptions.map(option => <option key={option}>{option}</option>)}</select></label>
        <Button type="submit" disabled={create.isPending || suppliers.length === 0} className="bg-slate-950 text-white hover:bg-slate-800"><ClipboardPlus className="mr-2 h-4 w-4" />Criar pedido</Button>
      </form>
    </section>
    <section className="sc-surface mt-5 overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-7"><h2 className="text-base font-extrabold tracking-tight text-slate-950">Acompanhamento de pedidos</h2></div>
      <Table><TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Fornecedor</TableHead><TableHead>Categoria</TableHead><TableHead>Criação</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {!isLoading && orders.length === 0 && <EmptyRow columns={5} text="Nenhum pedido de compra criado." />}
          {orders.map(order => <TableRow key={order.id}><TableCell className="font-bold text-slate-950">#{order.id}</TableCell><TableCell className="font-semibold">{order.supplierName}</TableCell><TableCell>{order.supplierCategory}</TableCell><TableCell>{formatDate(order.createdAt)}</TableCell><TableCell><div className="flex items-center gap-2"><Badge className={statusStyle[order.status]}>{order.status}</Badge><select aria-label={`Status do pedido ${order.id}`} className="control h-8 w-32 text-xs" value={order.status} onChange={e => updateStatus.mutate({ id: order.id, status: e.target.value as PurchaseOrderStatus })}>{statusOptions.map(option => <option key={option}>{option}</option>)}</select></div></TableCell></TableRow>)}
        </TableBody>
      </Table>
    </section>
  </div>;
}
