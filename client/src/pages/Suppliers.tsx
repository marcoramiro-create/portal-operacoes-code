import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Plus } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

const initialForm = { name: "", contact: "", category: "", deliveryLeadTime: "", evaluation: "" };

export default function Suppliers() {
  const utils = trpc.useUtils();
  const { data: suppliers = [], isLoading } = trpc.logistics.suppliers.list.useQuery();
  const [form, setForm] = useState(initialForm);
  const createSupplier = trpc.logistics.suppliers.create.useMutation({
    onSuccess: async () => {
      await utils.logistics.suppliers.list.invalidate();
      await utils.logistics.dashboard.invalidate();
      setForm(initialForm);
      toast.success("Fornecedor cadastrado.");
    },
    onError: error => toast.error(error.message),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createSupplier.mutate({
      name: form.name,
      contact: form.contact,
      category: form.category,
      deliveryLeadTime: Number(form.deliveryLeadTime),
      evaluation: Number(form.evaluation),
    });
  };

  return (
    <div className="page-wrap">
      <PageHeading eyebrow="Base de parceiros" title="Fornecedores" description="Cadastre e acompanhe os fornecedores que apoiam a operação." />
      <section className="sc-surface p-5 sm:p-7">
        <form className="grid gap-4 lg:grid-cols-5" onSubmit={submit}>
          <Field label="Nome"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Contato"><Input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} required /></Field>
          <Field label="Categoria"><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} required /></Field>
          <Field label="Prazo de entrega"><Input type="number" min="0" value={form.deliveryLeadTime} onChange={e => setForm({ ...form, deliveryLeadTime: e.target.value })} required /></Field>
          <Field label="Avaliação"><Input type="number" min="0" step="0.1" value={form.evaluation} onChange={e => setForm({ ...form, evaluation: e.target.value })} required /></Field>
          <div className="lg:col-span-5"><Button type="submit" disabled={createSupplier.isPending} className="bg-slate-950 text-white hover:bg-slate-800"><Plus className="mr-2 h-4 w-4" />Cadastrar fornecedor</Button></div>
        </form>
      </section>

      <section className="sc-surface mt-5 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-7"><h2 className="text-base font-extrabold tracking-tight text-slate-950">Fornecedores cadastrados</h2></div>
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Contato</TableHead><TableHead>Categoria</TableHead><TableHead>Prazo de entrega</TableHead><TableHead>Avaliação</TableHead></TableRow></TableHeader>
          <TableBody>
            {!isLoading && suppliers.length === 0 && <EmptyRow columns={5} text="Nenhum fornecedor cadastrado." />}
            {suppliers.map(supplier => <TableRow key={supplier.id}><TableCell className="font-bold text-slate-950">{supplier.name}</TableCell><TableCell>{supplier.contact}</TableCell><TableCell><Badge variant="secondary" className="bg-[#dcebf7] text-slate-700">{supplier.category}</Badge></TableCell><TableCell>{supplier.deliveryLeadTime} dias</TableCell><TableCell>{supplier.evaluation}</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

export function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="mb-7"><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl">{title}</h1><p className="mt-3 max-w-xl text-sm font-medium leading-6 text-slate-500">{description}</p></header>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2"><Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">{label}</Label>{children}</label>;
}

export function EmptyRow({ columns, text }: { columns: number; text: string }) {
  return <TableRow><TableCell colSpan={columns} className="h-28 text-center text-sm font-medium text-slate-500">{text}</TableCell></TableRow>;
}
