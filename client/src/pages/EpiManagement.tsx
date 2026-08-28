import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, LoaderCircle, Plus, ShieldCheck, Undo2, PackageCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

type EpiTab = "certificates" | "deliveries" | "alerts";

export default function EpiManagement({ initialTab = "certificates" }: { initialTab?: EpiTab }) {
  const [tab, setTab] = useState<EpiTab>(initialTab);
  const utils = trpc.useUtils();

  const permissions = trpc.portal.applicationPermissions.useQuery({
    nodeKey: tab === "deliveries" ? "entrega-epis" : "cadastros-epis",
  });
  const canManage = Boolean(permissions.data?.manage);

  const certificates = trpc.epi.listCertificates.useQuery(undefined, { retry: false });
  const deliveries = trpc.epi.listDeliveries.useQuery(undefined, { retry: false });
  const alerts = trpc.epi.caAlerts.useQuery({ daysAhead: 30 }, { retry: false });

  const refresh = () => {
    utils.epi.listCertificates.invalidate();
    utils.epi.listDeliveries.invalidate();
    utils.epi.caAlerts.invalidate();
  };

  const [certForm, setCertForm] = useState({
    productId: "", caNumber: "", manufacturer: "", caIssuedAt: "", caExpiresAt: "",
  });
  const [deliveryForm, setDeliveryForm] = useState({
    productId: "", employeeId: "", caNumber: "", batch: "", size: "", quantity: 1,
    deliveredAt: "", notes: "",
  });

  const products = trpc.inventoryCatalog.list.useQuery(undefined, { retry: false });
  const epiProducts = products.data?.products.filter((p: any) => p.inventoryControlCategory === "epi") ?? [];

  const employees = trpc.inventoryCatalog.list.useQuery(undefined, { retry: false });

  const createCertificate = trpc.epi.createCertificate.useMutation({
    onSuccess: () => { toast.success("Certificado CA cadastrado."); setCertForm({ productId: "", caNumber: "", manufacturer: "", caIssuedAt: "", caExpiresAt: "" }); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const createDelivery = trpc.epi.createDelivery.useMutation({
    onSuccess: () => { toast.success("Entrega de EPI registrada."); setDeliveryForm({ productId: "", employeeId: "", caNumber: "", batch: "", size: "", quantity: 1, deliveredAt: "", notes: "" }); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const returnDelivery = trpc.epi.returnDelivery.useMutation({
    onSuccess: () => { toast.success("Devolução registrada."); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const submit = (e: FormEvent, fn: () => void) => { e.preventDefault(); fn(); };

  const tabs: { key: EpiTab; label: string; icon: typeof ShieldCheck }[] = [
    { key: "certificates", label: "Certificados CA", icon: ShieldCheck },
    { key: "deliveries", label: "Entregas", icon: PackageCheck },
    { key: "alerts", label: "Alertas de CA", icon: AlertTriangle },
  ];

  const alertColors: Record<string, string> = {
    vencido: "text-red-600 font-bold",
    vencendo: "text-amber-600 font-bold",
    vigente: "text-green-600 font-semibold",
    revogado: "text-slate-500 font-semibold",
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-200 pb-3">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === key ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ABA: Certificados CA */}
      {tab === "certificates" && (
        <div className="grid gap-7 xl:grid-cols-[.88fr_1.12fr]">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Cadastro de Certificado de Aprovação (CA)</h2>
            <p className="mt-1 text-sm text-slate-500">Vincule o CA do MTE ao produto EPI cadastrado.</p>
            <form className="mt-6 grid gap-4" onSubmit={e => submit(e, () => createCertificate.mutate(certForm))}>
              <label className="grid gap-2">
                <Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Produto EPI</Label>
                <select
                  className="control"
                  value={certForm.productId}
                  disabled={!canManage}
                  onChange={e => setCertForm({ ...certForm, productId: e.target.value })}
                  required
                >
                  <option value="" disabled>Selecione o EPI</option>
                  {epiProducts.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Número do CA</Label>
                <Input
                  value={certForm.caNumber}
                  disabled={!canManage}
                  onChange={e => setCertForm({ ...certForm, caNumber: e.target.value })}
                  placeholder="Ex.: 12345"
                  required
                />
              </label>
              <label className="grid gap-2">
                <Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Fabricante</Label>
                <Input
                  value={certForm.manufacturer}
                  disabled={!canManage}
                  onChange={e => setCertForm({ ...certForm, manufacturer: e.target.value })}
                  placeholder="Ex.: 3M do Brasil"
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-2">
                  <Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Emissão CA</Label>
                  <Input
                    type="date"
                    value={certForm.caIssuedAt}
                    disabled={!canManage}
                    onChange={e => setCertForm({ ...certForm, caIssuedAt: e.target.value })}
                  />
                </label>
                <label className="grid gap-2">
                  <Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Validade CA</Label>
                  <Input
                    type="date"
                    value={certForm.caExpiresAt}
                    disabled={!canManage}
                    onChange={e => setCertForm({ ...certForm, caExpiresAt: e.target.value })}
                  />
                </label>
              </div>
              <Button type="submit" disabled={!canManage || createCertificate.isPending} className="bg-slate-950 hover:bg-slate-800">
                {createCertificate.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Cadastrar CA
              </Button>
            </form>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-100">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>CA</TableHead>
                  <TableHead>Fabricante</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certificates.data?.length ? certificates.data.map((c: any) => {
                  const isExpired = c.ca_expires_at && new Date(c.ca_expires_at) < new Date();
                  const isExpiring = c.ca_expires_at && new Date(c.ca_expires_at) <= new Date(Date.now() + 30 * 86400000) && !isExpired;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-semibold text-slate-950">{c.product_code} · {c.product_name}</TableCell>
                      <TableCell>{c.ca_number}</TableCell>
                      <TableCell>{c.manufacturer ?? "—"}</TableCell>
                      <TableCell>{c.ca_expires_at ? new Date(c.ca_expires_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                      <TableCell className={isExpired ? "text-red-600 font-bold" : isExpiring ? "text-amber-600 font-bold" : "text-green-600 font-semibold"}>
                        {c.status === "revoked" ? "Revogado" : isExpired ? "Vencido" : isExpiring ? "Vencendo" : "Vigente"}
                      </TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-28 text-center text-sm font-medium text-slate-500">
                      Nenhum certificado CA cadastrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ABA: Entregas */}
      {tab === "deliveries" && (
        <div className="grid gap-7 xl:grid-cols-[.88fr_1.12fr]">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Registrar Entrega de EPI</h2>
            <p className="mt-1 text-sm text-slate-500">Registre a entrega do EPI ao funcionário com CA, lote e tamanho.</p>
            <form className="mt-6 grid gap-4" onSubmit={e => submit(e, () => createDelivery.mutate(deliveryForm))}>
              <label className="grid gap-2">
                <Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Produto EPI</Label>
                <select className="control" value={deliveryForm.productId} disabled={!canManage} onChange={e => setDeliveryForm({ ...deliveryForm, productId: e.target.value })} required>
                  <option value="" disabled>Selecione o EPI</option>
                  {epiProducts.map((p: any) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </select>
              </label>
              <label className="grid gap-2">
                <Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Funcionário</Label>
                <select className="control" value={deliveryForm.employeeId} disabled={!canManage} onChange={e => setDeliveryForm({ ...deliveryForm, employeeId: e.target.value })} required>
                  <option value="" disabled>Selecione o funcionário</option>
                  {products.data?.employees?.map((emp: any) => <option key={emp.id} value={emp.id}>{emp.employee_code ?? ""} · {emp.full_name}</option>) ?? []}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-2">
                  <Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">CA</Label>
                  <Input value={deliveryForm.caNumber} disabled={!canManage} onChange={e => setDeliveryForm({ ...deliveryForm, caNumber: e.target.value })} placeholder="Nº do CA" />
                </label>
                <label className="grid gap-2">
                  <Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Lote</Label>
                  <Input value={deliveryForm.batch} disabled={!canManage} onChange={e => setDeliveryForm({ ...deliveryForm, batch: e.target.value })} placeholder="Lote" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-2">
                  <Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Tamanho</Label>
                  <Input value={deliveryForm.size} disabled={!canManage} onChange={e => setDeliveryForm({ ...deliveryForm, size: e.target.value })} placeholder="P, M, G, GG..." />
                </label>
                <label className="grid gap-2">
                  <Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Quantidade</Label>
                  <Input type="number" min={1} value={deliveryForm.quantity} disabled={!canManage} onChange={e => setDeliveryForm({ ...deliveryForm, quantity: Number(e.target.value) })} required />
                </label>
              </div>
              <label className="grid gap-2">
                <Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Data da entrega</Label>
                <Input type="date" value={deliveryForm.deliveredAt} disabled={!canManage} onChange={e => setDeliveryForm({ ...deliveryForm, deliveredAt: e.target.value })} />
              </label>
              <label className="grid gap-2">
                <Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Observações</Label>
                <Input value={deliveryForm.notes} disabled={!canManage} onChange={e => setDeliveryForm({ ...deliveryForm, notes: e.target.value })} placeholder="Opcional" />
              </label>
              <Button type="submit" disabled={!canManage || createDelivery.isPending} className="bg-slate-950 hover:bg-slate-800">
                {createDelivery.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Registrar entrega
              </Button>
            </form>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-100">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>CA</TableHead>
                  <TableHead>Tam.</TableHead>
                  <TableHead>Qtd</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.data?.length ? deliveries.data.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-semibold text-slate-950">{d.product_code} · {d.product_name}</TableCell>
                    <TableCell>{d.employee_name}</TableCell>
                    <TableCell>{d.ca_number ?? "—"}</TableCell>
                    <TableCell>{d.size ?? "—"}</TableCell>
                    <TableCell>{d.quantity}</TableCell>
                    <TableCell>{new Date(d.delivered_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className={d.status === "delivered" ? "text-blue-600 font-semibold" : "text-green-600 font-semibold"}>
                      {d.status === "delivered" ? "Entregue" : d.status === "returned" ? "Devolvido" : d.status === "lost" ? "Perdido" : "Descartado"}
                    </TableCell>
                    <TableCell>
                      {d.status === "delivered" && canManage && (
                        <Button size="sm" variant="outline" onClick={() => {
                          if (confirm("Confirmar devolução deste EPI?")) returnDelivery.mutate({ id: d.id });
                        }}>
                          <Undo2 className="mr-1 h-3 w-3" /> Devolver
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-28 text-center text-sm font-medium text-slate-500">
                      Nenhuma entrega registrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ABA: Alertas */}
      {tab === "alerts" && (
        <div>
          <h2 className="text-lg font-bold text-slate-950">Alertas de Vencimento de CA</h2>
          <p className="mt-1 text-sm text-slate-500">CAs vencidos ou vencendo nos próximos 30 dias.</p>
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>CA</TableHead>
                  <TableHead>Fabricante</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Dias restantes</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.data?.length ? alerts.data.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-semibold text-slate-950">{a.product_code} · {a.product_name}</TableCell>
                    <TableCell>{a.ca_number}</TableCell>
                    <TableCell>{a.manufacturer ?? "—"}</TableCell>
                    <TableCell>{a.ca_expires_at ? new Date(a.ca_expires_at).toLocaleDateString("pt-BR") : "Sem validade"}</TableCell>
                    <TableCell>{a.days_remaining ?? "—"}</TableCell>
                    <TableCell className={alertColors[a.alert_status] ?? ""}>{a.alert_status}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-28 text-center text-sm font-medium text-slate-500">
                      ✅ Nenhum CA vencendo nos próximos 30 dias.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
