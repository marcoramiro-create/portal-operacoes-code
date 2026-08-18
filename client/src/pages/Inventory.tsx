import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, Plus } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { EmptyRow, Field, PageHeading } from "./Suppliers";

const initialItem = { item: "", quantityAvailable: "", reorderPoint: "" };

export default function Inventory() {
  const utils = trpc.useUtils();
  const { data: items = [], isLoading: itemsLoading } = trpc.logistics.inventory.list.useQuery();
  const { data: movements = [], isLoading: movementsLoading } = trpc.logistics.inventory.movements.useQuery();
  const [itemForm, setItemForm] = useState(initialItem);
  const [movementForm, setMovementForm] = useState({ inventoryItemId: "", type: "entrada" as "entrada" | "saida", quantity: "" });
  const createItem = trpc.logistics.inventory.create.useMutation({
    onSuccess: async () => { await utils.logistics.inventory.list.invalidate(); await utils.logistics.dashboard.invalidate(); setItemForm(initialItem); toast.success("Item adicionado ao estoque."); },
    onError: error => toast.error(error.message),
  });
  const registerMovement = trpc.logistics.inventory.registerMovement.useMutation({
    onSuccess: async () => { await utils.logistics.inventory.list.invalidate(); await utils.logistics.inventory.movements.invalidate(); await utils.logistics.dashboard.invalidate(); await utils.logistics.reports.list.invalidate(); setMovementForm({ inventoryItemId: "", type: "entrada", quantity: "" }); toast.success("Movimentação registrada."); },
    onError: error => toast.error(error.message),
  });

  const submitItem = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); createItem.mutate({ item: itemForm.item, quantityAvailable: Number(itemForm.quantityAvailable), reorderPoint: Number(itemForm.reorderPoint) }); };
  const submitMovement = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); registerMovement.mutate({ inventoryItemId: Number(movementForm.inventoryItemId), type: movementForm.type, quantity: Number(movementForm.quantity) }); };

  return <div className="page-wrap">
    <PageHeading eyebrow="Disponibilidade" title="Estoque" description="Acompanhe a quantidade disponível, o ponto de reposição e as movimentações." />
    <section className="sc-surface p-5 sm:p-7"><form className="grid gap-4 md:grid-cols-[1fr_180px_180px_auto] md:items-end" onSubmit={submitItem}><Field label="Item"><Input value={itemForm.item} onChange={e => setItemForm({ ...itemForm, item: e.target.value })} required /></Field><Field label="Quantidade disponível"><Input type="number" min="0" value={itemForm.quantityAvailable} onChange={e => setItemForm({ ...itemForm, quantityAvailable: e.target.value })} required /></Field><Field label="Ponto de reposição"><Input type="number" min="0" value={itemForm.reorderPoint} onChange={e => setItemForm({ ...itemForm, reorderPoint: e.target.value })} required /></Field><Button type="submit" disabled={createItem.isPending} className="bg-slate-950 text-white hover:bg-slate-800"><Plus className="mr-2 h-4 w-4" />Adicionar item</Button></form></section>
    <section className="sc-surface mt-5 overflow-hidden"><div className="border-b border-slate-100 px-5 py-5 sm:px-7"><h2 className="text-base font-extrabold tracking-tight text-slate-950">Itens em estoque</h2></div><Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Quantidade disponível</TableHead><TableHead>Ponto de reposição</TableHead></TableRow></TableHeader><TableBody>{!itemsLoading && items.length === 0 && <EmptyRow columns={3} text="Nenhum item de estoque cadastrado." />}{items.map(item => <TableRow key={item.id}><TableCell className="font-bold text-slate-950">{item.item}</TableCell><TableCell><Badge className={item.quantityAvailable <= item.reorderPoint ? "bg-[#f4d8dc] text-slate-700" : "bg-[#dcead9] text-slate-700"}>{item.quantityAvailable}</Badge></TableCell><TableCell>{item.reorderPoint}</TableCell></TableRow>)}</TableBody></Table></section>
    <section className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.4fr]">
      <div className="sc-surface p-5 sm:p-7"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f1ccd7] text-slate-950"><Boxes className="h-4 w-4" /></span><div><p className="text-base font-extrabold tracking-tight text-slate-950">Movimentação</p><p className="text-xs font-medium text-slate-500">Entrada ou saída de estoque</p></div></div><form className="mt-6 grid gap-4" onSubmit={submitMovement}><label className="grid gap-2"><Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Item</Label><select className="control" value={movementForm.inventoryItemId} onChange={e => setMovementForm({ ...movementForm, inventoryItemId: e.target.value })} required><option value="" disabled>Selecione</option>{items.map(item => <option value={item.id} key={item.id}>{item.item}</option>)}</select></label><label className="grid gap-2"><Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Tipo</Label><select className="control" value={movementForm.type} onChange={e => setMovementForm({ ...movementForm, type: e.target.value as "entrada" | "saida" })}><option value="entrada">Entrada</option><option value="saida">Saída</option></select></label><label className="grid gap-2"><Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Quantidade</Label><Input type="number" min="1" value={movementForm.quantity} onChange={e => setMovementForm({ ...movementForm, quantity: e.target.value })} required /></label><Button type="submit" disabled={registerMovement.isPending || items.length === 0} className="bg-slate-950 text-white hover:bg-slate-800">Registrar movimentação</Button></form></div>
      <div className="sc-surface overflow-hidden"><div className="border-b border-slate-100 px-5 py-5 sm:px-7"><h2 className="text-base font-extrabold tracking-tight text-slate-950">Histórico de movimentações</h2></div><Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Tipo</TableHead><TableHead>Quantidade</TableHead><TableHead>Data</TableHead></TableRow></TableHeader><TableBody>{!movementsLoading && movements.length === 0 && <EmptyRow columns={4} text="Nenhuma movimentação registrada." />}{movements.map(movement => <TableRow key={movement.id}><TableCell className="font-bold text-slate-950">{movement.item}</TableCell><TableCell><span className="flex items-center gap-1.5 font-semibold">{movement.type === "entrada" ? <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-700" /> : <ArrowUpFromLine className="h-3.5 w-3.5 text-rose-700" />}{movement.type}</span></TableCell><TableCell>{movement.quantity}</TableCell><TableCell>{formatDate(movement.occurredAt)}</TableCell></TableRow>)}</TableBody></Table></div>
    </section>
  </div>;
}
