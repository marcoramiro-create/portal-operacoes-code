import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Permission = "view" | "manage" | "approve";
const labels: Record<Permission, string> = { view: "Consultar", manage: "Administrar", approve: "Aprovar" };

export default function AccessProfiles() {
  const profilesQuery = trpc.portal.profiles.useQuery();
  const [profileKey, setProfileKey] = useState("");
  useEffect(() => { if (!profileKey && profilesQuery.data?.[0]) setProfileKey(profilesQuery.data[0].key); }, [profileKey, profilesQuery.data]);
  const matrixQuery = trpc.portal.profileNodePermissions.useQuery({ profileKey: profileKey as "development-admin" | "operations-admin" | "manager" | "operator" | "viewer" }, { enabled: Boolean(profileKey) });
  const update = trpc.portal.updateProfileNodePermission.useMutation({ onSuccess: () => { matrixQuery.refetch(); toast.success("Permissão do perfil atualizada."); }, onError: error => toast.error(error.message) });
  const selected = profilesQuery.data?.find(profile => profile.key === profileKey);

  return <div className="page-wrap"><header className="mb-7"><p className="eyebrow">Administração · Acessos</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.055em] text-slate-950 sm:text-4xl">Perfis de acesso</h1><p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-500">Defina o padrão de acesso de cada perfil para aplicações e subaplicações. Exceções por usuário são administradas em Usuários e solicitações.</p></header><section className="sc-surface overflow-hidden"><div className="border-b border-slate-100 p-5 sm:p-7"><label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Perfil selecionado</label><select className="control mt-2 max-w-xl" value={profileKey} onChange={event => setProfileKey(event.target.value)}>{profilesQuery.data?.map(profile => <option key={profile.key} value={profile.key}>{profile.name}</option>)}</select>{selected && <p className="mt-3 text-sm font-medium text-slate-500">{selected.description}</p>}</div>{matrixQuery.isLoading ? <div className="flex items-center gap-2 p-7 text-sm font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando matriz de permissões…</div> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead><tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-500"><th className="px-5 py-4 sm:px-7">Aplicação</th>{(["view", "manage", "approve"] as Permission[]).map(permission => <th key={permission} className="px-4 py-4 text-center">{labels[permission]}</th>)}</tr></thead><tbody>{matrixQuery.data?.map(node => <tr key={node.id} className="border-b border-slate-50"><td className="px-5 py-3 text-sm font-bold text-slate-800 sm:px-7" style={{ paddingLeft: `${28 + (node.parentId ? 24 : 0)}px` }}>{node.parentId ? "↳ " : ""}{node.label}</td>{(["view", "manage", "approve"] as Permission[]).map(permission => <td className="px-4 py-3 text-center" key={permission}><Button type="button" size="icon" variant={node[permission] ? "default" : "outline"} className={node[permission] ? "h-8 w-8 bg-slate-950 text-white hover:bg-slate-800" : "h-8 w-8"} disabled={update.isPending} aria-label={`${labels[permission]} ${node.label}`} onClick={() => update.mutate({ profileKey: profileKey as "development-admin" | "operations-admin" | "manager" | "operator" | "viewer", nodeId: node.id, permission, allowed: !node[permission] })}>{node[permission] && <Check className="h-4 w-4" />}</Button></td>)}</tr>)}</tbody></table></div>}</section></div>;
}
