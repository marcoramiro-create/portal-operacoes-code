import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { registrationLayouts, registrationTypes, RegistrationType } from "../../../shared/registrationLayouts";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type UserOption = { id: string; email: string; displayName: string | null; isDevelopmentAdmin: boolean };
type Operation = "view" | "create" | "import" | "manage";
const operationLabels: Record<Operation, string> = { view: "Consultar", create: "Cadastrar", import: "Importar", manage: "Administrar" };

export function RegistrationPermissions({ users }: { users: UserOption[] }) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const selectedUser = users.find(user => user.id === selectedUserId);
  const permissionsQuery = trpc.portal.registrationPermissions.useQuery({ userId: selectedUserId }, { enabled: Boolean(selectedUserId) });
  const update = trpc.portal.updateRegistrationPermission.useMutation({ onSuccess: () => { permissionsQuery.refetch(); toast.success("Liberação atualizada."); }, onError: error => toast.error(error.message) });
  useEffect(() => { if (!selectedUserId && users[0]) setSelectedUserId(users[0].id); }, [selectedUserId, users]);

  return <section className="sc-surface mt-5 overflow-hidden"><div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-7"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#dcebf7] text-slate-950"><ShieldCheck className="h-4 w-4" /></span><div><h2 className="text-base font-extrabold tracking-tight text-slate-950">Liberações por usuário</h2><p className="mt-1 text-xs font-medium text-slate-500">A matriz do perfil é o padrão. Use esta área para liberar ou restringir uma ação específica para uma pessoa.</p></div></div><div className="p-5 sm:p-7"><Label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Usuário</Label><select className="control mt-2 max-w-xl" value={selectedUserId} onChange={event => setSelectedUserId(event.target.value)}>{users.map(user => <option key={user.id} value={user.id}>{user.displayName ?? user.email} · {user.email}</option>)}</select>{selectedUser?.isDevelopmentAdmin ? <p className="mt-5 rounded-xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">O administrador técnico mantém acesso total e não pode ser restringido nesta tela.</p> : permissionsQuery.isLoading ? <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando liberações…</div> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead><tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-500"><th className="pb-3 pr-5">Cadastro</th>{(["view", "create", "import", "manage"] as Operation[]).map(operation => <th className="pb-3 px-2 text-center" key={operation}>{operationLabels[operation]}</th>)}</tr></thead><tbody>{registrationTypes.map(type => { const row = permissionsQuery.data?.find(item => item.type === type); return <tr className="border-b border-slate-50" key={type}><td className="py-3 pr-5 text-sm font-bold text-slate-800">{registrationLayouts[type].label}</td>{(["view", "create", "import", "manage"] as Operation[]).map(operation => <td className="px-2 py-3 text-center" key={operation}><input aria-label={`${operationLabels[operation]} ${registrationLayouts[type].label}`} type="checkbox" className="h-4 w-4 accent-slate-950" checked={row?.operations[operation] ?? false} disabled={update.isPending} onChange={event => update.mutate({ userId: selectedUserId, type, operation, allowed: event.target.checked })} /></td>)}</tr>; })}</tbody></table></div>}</div></section>;
}
