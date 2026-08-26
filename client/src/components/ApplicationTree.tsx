import { ChevronDown, ChevronRight, FileSpreadsheet, Folder, FolderOpen, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import type { ApplicationTreeNode } from "../../../server/supabasePortal";

const nodePaths: Record<string, string> = {
  "compras-protheus": "/",
  administracao: "/usuarios",
  "usuarios-solicitacoes": "/usuarios",
  cadastros: "/cadastros/funcionarios",
  funcionarios: "/cadastros/funcionarios",
  fornecedores: "/cadastros/fornecedores",
  produtos: "/cadastros/produtos",
};

const nodeIcons: Record<string, typeof Folder> = {
  administracao: ShieldCheck,
  "compras-protheus": FileSpreadsheet,
};

export default function ApplicationTree({ nodes }: { nodes: ApplicationTreeNode[] }) {
  return <div className="mt-5 border-t border-slate-200/70 pt-4"><p className="px-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Aplicações</p><div className="mt-2 space-y-0.5">{nodes.map(node => <TreeNode key={node.id} node={node} depth={0} />)}</div></div>;
}

function TreeNode({ node, depth }: { node: ApplicationTreeNode; depth: number }) {
  const [location, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = node.children.length > 0;
  const path = nodePaths[node.key];
  const active = path === location;
  const Icon = nodeIcons[node.key] ?? (hasChildren ? Folder : FileSpreadsheet);

  const handleClick = () => {
    if (path) setLocation(path);
    else if (hasChildren) setExpanded(value => !value);
  };

  return <div>
    <button
      type="button"
      onClick={handleClick}
      className={`flex min-h-8 w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-[12px] font-semibold transition-colors ${active ? "bg-white text-slate-950 shadow-sm" : path || hasChildren ? "text-slate-700 hover:bg-white/75" : "cursor-default text-slate-500"}`}
      style={{ paddingLeft: `${12 + depth * 13}px` }}
      aria-expanded={hasChildren ? expanded : undefined}
    >
      {hasChildren ? (expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />) : <span className="w-3.5 shrink-0" />}
      <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-slate-950" : "text-slate-500"}`} />
      <span className="min-w-0 truncate">{node.label}</span>
    </button>
    {hasChildren && expanded && <div>{node.children.map(child => <TreeNode key={child.id} node={child} depth={depth + 1} />)}</div>}
  </div>;
}
