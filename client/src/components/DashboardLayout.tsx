import { LogOut, PackageCheck, PanelLeft, Home, ShoppingCart, FileText, TrendingUp, Boxes, Wrench, Users, ShieldCheck, Building2, MapPin, Package, Truck, ClipboardList, Warehouse, Settings, UploadCloud } from "lucide-react";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
const SIDEBAR_WIDTH_KEY = "portal-sidebar-width";
const DEFAULT_WIDTH = 270;
const MIN_WIDTH = 224;
const MAX_WIDTH = 390;
// REGRA DE PERMISSÃO DO MENU (atualizada em 28/09/2026):
// - Administrador técnico (isDevelopmentAdmin) vê TODOS os itens (com e sem nó).
// - O item "Início" (alwaysVisible) aparece para TODOS os usuários logados,
//   sem depender de liberação — decisão do usuário em 28/09/2026.
// - Demais usuários veem APENAS os itens que têm nó de referência (nodeLabels)
//   E cujo nó (ou um nó PAI dele) esteja liberado para o usuário logado.
//   Regra "pai libera filho": liberar um nó pai mostra os itens dos filhos.
// - Itens sem nó (Almoxarifado, Empresas/Filiais/etc.) aparecem SOMENTE
//   para administrador técnico (exceto Início, sempre visível).
// - "Compras (Protheus)" aceita os DOIS nós: o de análise (Compras e análise
//   Protheus) e o de importação (Importar · Análise de compras Protheus).
// - Seção do menu: mostra só os itens permitidos; se não sobrar nenhum,
//   a seção inteira é escondida.
// - Consulta: applicationTree (endpoint do próprio usuário logado, sem exigir
//   admin) — devolve os nós liberados e os pais intermediários.
type MenuItem = { label: string; path: string; icon: any; nodeLabels?: string[]; alwaysVisible?: boolean };
type MenuSection = { title: string; items: MenuItem[] };
type TreeNode = { label: string; children?: TreeNode[] };
const MENU: MenuSection[] = [
  {
    title: "Principal",
    items: [
      { label: "Início", path: "/", icon: Home, alwaysVisible: true },
      { label: "Compras (Protheus)", path: "/compras/protheus", icon: ShoppingCart, nodeLabels: ["Compras e análise Protheus", "Importar · Análise de compras Protheus"] },
      { label: "Recebimentos NF", path: "/recebimentos/nf", icon: FileText, nodeLabels: ["Leitura de chave de acesso de NF", "Recebimentos"] },
    ],
  },
  {
    title: "Custos",
    items: [
      { label: "Custos Auto Peças", path: "/custos/autopecas", icon: TrendingUp, nodeLabels: ["Evolução de custos de autopeças", "Suprimentos e estoques"] },
      { label: "Custos Indústria", path: "/custos/industria", icon: TrendingUp, nodeLabels: ["Evolução de custos da indústria", "Suprimentos e estoques"] },
    ],
  },
  {
    title: "Importações",
    items: [
      { label: "Custos Auto Peças", path: "/importacoes/custos-autopecas", icon: UploadCloud, nodeLabels: ["Importar · Evolução de custos de autopeças", "Importações"] },
      { label: "Custos Indústria", path: "/importacoes/custos-industria", icon: UploadCloud, nodeLabels: ["Importar · Evolução de custos da indústria", "Importações"] },
      { label: "Entrada de Materiais", path: "/importacoes/entrada-materiais", icon: UploadCloud, nodeLabels: ["Importar · Entrada de materiais", "Importações"] },
      { label: "Compras (Protheus)", path: "/importacoes/compras-protheus", icon: UploadCloud, nodeLabels: ["Importar · Análise de compras Protheus", "Importações"] },
      { label: "Funcionários", path: "/importacoes/funcionarios", icon: UploadCloud },
      { label: "Fornecedores", path: "/importacoes/fornecedores", icon: UploadCloud },
      { label: "Produtos", path: "/importacoes/produtos", icon: UploadCloud },
      { label: "Empresas", path: "/importacoes/empresas", icon: UploadCloud },
      { label: "Filiais", path: "/importacoes/filiais", icon: UploadCloud },
      { label: "Armazéns", path: "/importacoes/armazens", icon: UploadCloud },
      { label: "Locais de Estoque", path: "/importacoes/locais-estoque", icon: UploadCloud },
      { label: "Unidades", path: "/importacoes/unidades", icon: UploadCloud },
      { label: "Centros de Custo", path: "/importacoes/centros-custo", icon: UploadCloud },
      { label: "Tipos de Produto", path: "/importacoes/tipos-produto", icon: UploadCloud },
      { label: "Usuários", path: "/importacoes/usuarios", icon: UploadCloud },
      { label: "Empilhadeiras", path: "/importacoes/ativos-empilhadeiras", icon: UploadCloud },
      { label: "Equipamentos Indústria", path: "/importacoes/ativos-equipamentos-industria", icon: UploadCloud },
      { label: "Ferramentas", path: "/importacoes/ativos-ferramentas", icon: UploadCloud },
    ],
  },
  {
    title: "Almoxarifado",
    items: [
      { label: "Requisições", path: "/almoxarifado/requisicoes", icon: ClipboardList },
      { label: "Atendimentos", path: "/almoxarifado/atendimentos", icon: PackageCheck },
      { label: "Devoluções", path: "/almoxarifado/devolucoes", icon: Truck },
      { label: "Movimentações", path: "/almoxarifado/movimentacoes", icon: Boxes },
      { label: "Estoque", path: "/almoxarifado/estoque", icon: Warehouse },
      { label: "Ferramentas", path: "/almoxarifado/ferramentas", icon: Wrench },
    ],
  },
  {
    title: "Ativos",
    items: [
      { label: "Empilhadeiras", path: "/ativos/empilhadeiras", icon: Wrench, nodeLabels: ["Empilhadeiras", "Ativos e manutenção"] },
      { label: "Equipamentos Indústria", path: "/ativos/equipamentos-industria", icon: Wrench, nodeLabels: ["Equipamentos da indústria", "Ativos e manutenção"] },
      { label: "Ferramentas", path: "/ativos/ferramentas", icon: Wrench, nodeLabels: ["Ferramentas de oficinas e indústria", "Ativos e manutenção"] },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { label: "Funcionários", path: "/cadastros/funcionarios", icon: Users, nodeLabels: ["Funcionários", "Cadastros"] },
      { label: "Fornecedores", path: "/cadastros/fornecedores", icon: Truck, nodeLabels: ["Fornecedores", "Cadastros"] },
      { label: "Produtos", path: "/cadastros/produtos", icon: Package, nodeLabels: ["Produtos", "Cadastros"] },
      { label: "Empresas", path: "/cadastros/empresas", icon: Building2 },
      { label: "Filiais", path: "/cadastros/filiais", icon: Building2 },
      { label: "Armazéns", path: "/cadastros/armazens", icon: Warehouse },
      { label: "Locais de Estoque", path: "/cadastros/locais-estoque", icon: MapPin },
      { label: "Unidades", path: "/cadastros/unidades", icon: Building2 },
      { label: "Centros de Custo", path: "/cadastros/centros-custo", icon: Settings },
      { label: "Tipos de Produto", path: "/cadastros/tipos-produto", icon: Package },
      { label: "Empilhadeiras", path: "/cadastros/empilhadeiras", icon: Wrench },
      { label: "Equipamentos Indústria", path: "/cadastros/equipamentos-industria", icon: Wrench },
      { label: "Ferramentas", path: "/cadastros/ferramentas", icon: Wrench },
    ],
  },
  {
    title: "Administração",
    items: [
      { label: "Usuários", path: "/usuarios", icon: Users, nodeLabels: ["Usuários e solicitações", "Administração"] },
      { label: "Perfis de Acesso", path: "/perfis-acesso", icon: ShieldCheck, nodeLabels: ["Perfis de acesso", "Administração"] },
      { label: "Auditoria de Cruzamentos", path: "/administracao/auditoria-cruzamentos", icon: ShieldCheck },
      { label: "Backlog da Auditoria", path: "/administracao/auditoria-backlog", icon: ShieldCheck },
    ],
  },
];
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || DEFAULT_WIDTH);
  useEffect(() => localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString()), [sidebarWidth]);
  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent></SidebarProvider>;
}
function DashboardLayoutContent({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (width: number) => void }) {
  const [, setLocation] = useLocation();
  const { state, toggleSidebar, setOpen, setOpenMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { signOut, portalIdentity, loading: authLoading } = useSupabaseAuth();
  // ----- FILTRO DO MENU POR PERMISSÃO (regra "pai libera filho", 28/09/2026) -----
  const isDevAdmin = Boolean(portalIdentity?.isDevelopmentAdmin);
  // applicationTree = os nós liberados para o PRÓPRIO usuário logado (não exige admin)
  const treeQuery = trpc.portal.applicationTree.useQuery(undefined, {
    enabled: Boolean(portalIdentity) && !isDevAdmin,
    retry: false,
  });
  // labels de todos os nós liberados (pais e filhos) presentes na árvore
  const allowedNodeLabels = useMemo(() => {
    if (isDevAdmin) return null; // admin técnico: acesso integral (null = vê tudo)
    const collect = (nodes: TreeNode[]): string[] => nodes.flatMap((node) => [node.label, ...collect(node.children ?? [])]);
    return new Set(collect(treeQuery.data ?? []));
  }, [isDevAdmin, treeQuery.data]);
  // seções visíveis: admin vê o MENU inteiro; demais veem só os itens permitidos
  const visibleSections = useMemo(() => {
    if (isDevAdmin) return MENU;
    if (!allowedNodeLabels) return []; // permissões ainda carregando: não expõe itens antes da hora
    return MENU
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (item.alwaysVisible) return true; // Início: sempre visível para todos
          if (!item.nodeLabels || item.nodeLabels.length === 0) return false; // sem nó = só admin
          return item.nodeLabels.some((label) => allowedNodeLabels.has(label)); // nó OU pai liberado
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [isDevAdmin, allowedNodeLabels]);
  // ----- FIM DO FILTRO -----
  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!isResizing) return;
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const width = event.clientX - left;
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width);
    };
    const up = () => setIsResizing(false);
    if (isResizing) { document.addEventListener("mousemove", move); document.addEventListener("mouseup", up); document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.body.style.cursor = ""; document.body.style.userSelect = ""; };
  }, [isResizing, setSidebarWidth]);
  const handleSignOut = async () => {
    setIsSigningOut(true);
    const { error } = await signOut();
    setIsSigningOut(false);
    if (error) { toast.error("Não foi possível encerrar a sessão. Tente novamente."); return; }
    setLocation("/");
  };
  const handleNavigate = (path: string) => {
    setOpen(false);
    if (isMobile) setOpenMobile(false);
    setLocation(path);
  };
  return <>
    <div className="relative" ref={sidebarRef}>
      <Sidebar collapsible="icon" className="border-r-0 bg-[#eff2f4]" disableTransition={isResizing}>
        <SidebarHeader className="h-22 justify-center px-3"><div className="flex items-center gap-3 px-1"><button onClick={toggleSidebar} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" aria-label="Alternar navegação"><PanelLeft className="h-4 w-4" /></button>{!isCollapsed && <div className="flex min-w-0 items-center gap-2.5"><div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-[10px] bg-slate-950 text-white"><PackageCheck className="relative z-10 h-4 w-4" /><span className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-[#9fc7ea]" /></div><div className="min-w-0 leading-none"><p className="truncate text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-950">Portal</p><p className="mt-1 truncate text-[11px] font-medium text-slate-500">Operações</p></div></div>}</div></SidebarHeader>
        <SidebarContent className="gap-0 overflow-y-auto px-2 pt-3">
          {!authLoading && (isMobile || !isCollapsed) && visibleSections.map((section) => (
            <div key={section.title} className="mb-3">
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{section.title}</p>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.path + item.label}>
                    <SidebarMenuButton type="button" onClick={() => handleNavigate(item.path)} tooltip={item.label} className="text-slate-700 hover:bg-white hover:text-slate-950">
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </div>
          ))}
          <div className="mt-auto border-t border-slate-200/70 px-1 py-3"><SidebarMenu><SidebarMenuItem><SidebarMenuButton type="button" onClick={() => { setOpen(false); if (isMobile) setOpenMobile(false); void handleSignOut(); }} disabled={isSigningOut} tooltip="Sair da aplicação" className="text-slate-700 hover:bg-white hover:text-slate-950"><LogOut className="h-4 w-4" /><span>{isSigningOut ? "Saindo…" : "Sair da aplicação"}</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></div>
        </SidebarContent>
      </Sidebar>
      <div className={`absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize transition-colors hover:bg-slate-950/10 ${isCollapsed ? "hidden" : ""}`} onMouseDown={() => setIsResizing(true)} />
    </div>
    <SidebarInset className="bg-[#f2f4f5]">{isMobile && <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-[#f2f4f5]/90 px-4 backdrop-blur"><SidebarTrigger className="h-9 w-9 rounded-lg bg-white shadow-sm" /><span className="text-sm font-extrabold tracking-tight text-slate-950">Portal</span></header>}<main className="min-h-screen px-4 py-5 sm:px-7 sm:py-8 lg:px-10 lg:py-10">{children}</main></SidebarInset>
  </>;
}