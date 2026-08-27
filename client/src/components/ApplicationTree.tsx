import { ChevronDown, ChevronRight, FileSpreadsheet, Folder, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { applicationPaths } from "@/lib/portalNavigation";
import type { ApplicationTreeNode } from "../../../server/supabasePortal";

const nodeIcons: Record<string, typeof Folder> = {
  administracao: ShieldCheck,
  "compras-protheus": FileSpreadsheet,
};

export default function ApplicationTree({ nodes, onNavigate }: { nodes: ApplicationTreeNode[]; onNavigate?: () => void }) {
  return <div className="mt-5 border-t border-slate-200/70 pt-4"><p className="px-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Aplicações</p><div className="mt-2 space-y-0.5">{nodes.map(node => <TreeNode key={node.id} node={node} depth={0} onNavigate={onNavigate} />)}</div></div>;
}

function TreeNode({ node, depth, onNavigate }: { node: ApplicationTreeNode; depth: number; onNavigate?: () => void }) {
  const [location, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = node.children.length > 0;
  const path = applicationPaths[node.key];
  const active = path === location;
  const Icon = nodeIcons[node.key] ?? (hasChildren ? Folder : FileSpreadsheet);
  const handleNavigate = () => { if (path) { setLocation(path); onNavigate?.(); } else if (hasChildren) setExpanded(value => !value); };
  return <div><div className="flex min-h-8" style={{ paddingLeft: `${12 + depth * 13}px` }}>{hasChildren ? <button type="button" className="flex w-5 shrink-0 items-center justify-center rounded-l-lg hover:bg-white/75" onClick={() => setExpanded(value => !value)} aria-label={`${expanded ? "Recolher" : "Expandir"} ${node.label}`} aria-expanded={expanded}>{expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}</button> : <span className="w-5 shrink-0" />}<button type="button" onClick={handleNavigate} className={`flex min-w-0 flex-1 items-center gap-2 rounded-r-lg py-1.5 pr-2 text-left text-[12px] font-semibold transition-colors ${active ? "bg-white text-slate-950 shadow-sm" : path || hasChildren ? "text-slate-700 hover:bg-white/75" : "cursor-default text-slate-500"}`}><Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-slate-950" : "text-slate-500"}`} /><span className="min-w-0 truncate">{node.label}</span></button></div>{hasChildren && expanded && <div>{node.children.map(child => <TreeNode key={child.id} node={child} depth={depth + 1} onNavigate={onNavigate} />)}</div>}</div>;
}
