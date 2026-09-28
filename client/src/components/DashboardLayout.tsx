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
// REGRA DE PERMISSÃO DO MENU (definida com o usuário em 27/09/2026):
// - Administrador técnico (isDevelopmentAdmin) vê TODOS os itens (com e sem nó).
// - Demais usuários veem APENAS os itens que têm nó na application_nodes
//   (campo nodeLabel) E com permissão de consulta (view) no módulo.
// - Itens sem nó (Início, Importações, Almoxarifado, Empresas/Filiais/etc.)
//   aparecem SOMENTE para administrador técnico.
// - Seção do menu: mostra só os itens permitidos; se não sobrar nenhum,
//   a seção inteira é escondida.
// nodeLabel = label EXATO do nó em application_nodes (migration 0001_portal_core.sql).
type MenuItem = { label: string; path: string; icon: any; nodeLabel?: string };
type MenuSection = { title: string; items: MenuItem[] };
const MENU: MenuSection[] = [
  {
    title: "Principal",
    items: [
      { label: "Início", path: "/", icon: Home },
      { label: "Compras (Protheus)", path: "/compras/protheus", icon: ShoppingCart, nodeLabel: "Compras e análise Protheus" },
      { label: "Recebimentos NF", path: "/recebimentos/nf", icon: FileText, nodeLabel: "Leitura de chave de acesso de NF" },
    ],
  },
  {
    title: "Custos",
    items: [
      { label: "Custos Auto Peças", path: "/custos/autopecas", icon: TrendingUp, nodeLabel: "Evolução de custos de autopeças" },
      { label: "Custos Indústria", path: "/custos/industria", icon: TrendingUp, nodeLabel: "Evolução de custos da indústria" },
    ],
  },
  {
    title: "Importações",
    items: [
      { label: "Custos Auto Peças", path: "/importacoes/custos-autopecas", icon: UploadCloud },
      { label: "Custos Indústria", path: "/importacoes/custos-industria", icon: UploadCloud },
      { label: "Compras (Protheus)", path: "/importacoes/compras-protheus", icon: UploadCloud },
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
      { label: "Empilhadeiras", path: "/ativos/empilhadeiras", icon: Wrench, nodeLabel: "Empilhadeiras" },
      { label: "Equipamentos Indústria", path: "/ativos/equipamentos-industria", icon: Wrench, nodeLabel: "Equipamentos da indústria" },
      { label: "Ferramentas", path: "/ativos/ferramentas", icon: Wrench, nodeLabel: "Ferramentas de oficinas e indústria" },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { label: "Funcionários", path: "/cadastros/funcionarios", icon: Users, nodeLabel: "Funcionários" },
      { label: "Fornecedores", path: "/cadastros/fornecedores", icon: Truck, nodeLabel: "Fornecedores" },
      { label: "Produtos", path: "/cadastros/produtos", icon: Package, nodeLabel: "Produtos" },
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
      { label: "Usuários", path: "/usuarios", icon: Users, nodeLabel: "Usuários e solicitações" },
      { label: "Perfis de Acesso", path: "/perfis-acesso", icon: ShieldCheck, nodeLabel: "Perfis de acesso" },
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
  // ----- FILTRO DO MENU POR PERMISSÃO (27/09/2026) -----
  const isDevAdmin = Boolean(portalIdentity?.isDevelopmentAdmin);
  const canLoadPermissions = Boolean(portalIdentity?.id) && !isDevAdmin;
  const permissionsQuery = trpc.portal.userNodePermissions.useQuery(
    { userId: portalIdentity?.id ?? "" },
    { enabled: canLoadPermissions, retry: false }
  );
  // label dos nós em que o usuário tem permissão de consulta (view)
  const allowedNodeLabels = useMemo(() => {
    if (isDevAdmin) return null; // admin técnico: acesso integral (null = vê tudo)
    return new Set((permissionsQuery.data ?? []).filter(node => node.view).map(node => node.label));
  }, [isDevAdmin, permissionsQuery.data]);
  // seções visíveis: admin vê o MENU inteiro; demais veem só os itens permitidos
  const visibleSections = useMemo(() => {
    if (isDevAdmin) return MENU;
    if (!allowedNodeLabels) return []; // permissões ainda carregando: não expõe itens antes da hora
    return MENU
      .map(section => ({
        ...section,
        items: section.items.filter(item => Boolean(item.nodeLabel) && allowedNodeLabels.has(item.nodeLabel!)),
      }))
      .filter(section => section.items.length > 0);
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