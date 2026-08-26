import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { LoaderCircle, Network } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type UserOption = { id: string; email: string; displayName: string | null; isDevelopmentAdmin: boolean };
type Permission = "view" | "manage" | "approve";
const permissions: Permission[] = ["view", "manage", "approve"];
const labels: Record<Permission, string> = { view: "Consultar", manage: "Administrar", approve: "Aprovar" };

export function UserModulePermissions({ users }: { users: UserOption[] }) {
  const [userId, setUserId] = useState("");
  const selected = users.find(user => user.id === userId);
  useEffect(() => { if (!userId && users[0]) setUserId(users[0].id); }, [userId, users]);
  const matrixQuery = trpc.portal.userNodePermissions.useQuery({ userId }, { enabled: Boolean(userId) && !selected?.isDevelopmentAdmin });
  const update = trpc.portal.updateUserNodePermission.useMutation({ onSuccess: () => { matrixQuery.refetch(); toast.success("Exceção individual atualizada."); }, onError: error => toast.error(error.message) });
  return <section className="sc-surface mt-5 overflow-hidden"><div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-7"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f1ccd7] text-slate-950"><Network className="h-4 w-4" /></span><div><h2 className="text-base font-extrabold tracking-tight text-slate-950">Módulos liberados individualmente</h2><p className="mt-1 text-xs font-medium text-slate-500">Cada alteração abaixo substitui o padrão do perfil somente para este usuário.</p></div></div><div className="p-5 sm:p-7"><select className="control max-w-xl" value={userId} onChange={event => setUserId(event.target.value)}>{users.map(user => <option key={user.id} value={user.id}>{user.displayName ?? user.email} · {user.email}</option>)}</select>{selected?.isDevelopmentAdmin ? <p className="mt-5 rounded-xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">O administrador técnico mantém acesso integral sem exceções individuais.</p> : matrixQuery.isLoading ? <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando liberações…</div> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead><tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-500"><th className="pb-3">Módulo</th>{permissions.map(permission => <th key={permission} className="px-3 pb-3 text-center">{labels[permission]}</th>)}</tr></thead><tbody>{matrixQuery.data?.map(node => <tr className="border-b border-slate-50" key={node.id}><td className="py-3 text-sm font-bold text-slate-800" style={{ paddingLeft: node.parentId ? "20px" : 0 }}>{node.parentId ? "↳ " : ""}{node.label}</td>{permissions.map(permission => <td className="px-3 py-3 text-center" key={permission}><Button type="button" size="sm" variant={node[permission] ? "default" : "outline"} className={node[permission] ? "bg-slate-950 text-white hover:bg-slate-800" : ""} disabled={update.isPending} onClick={() => update.mutate({ userId, nodeId: node.id, permission, allowed: !node[permission] })}>{node[permission] ? "Liberado" : "Bloqueado"}</Button></td>)}</tr>)}</tbody></table></div>}</div></section>;
}
