import { LogOut, PackageCheck, PanelLeft, Home, ShoppingCart, FileText, TrendingUp, Boxes, Wrench, Users, ShieldCheck, Building2, MapPin, Package, Truck, ClipboardList, Warehouse, Settings } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
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

const SIDEBAR_WIDTH_KEY = "portal-sidebar-width";
const DEFAULT_WIDTH = 270;
const MIN_WIDTH = 224;
const MAX_WIDTH = 390;

type MenuItem = { label: string; path: string; icon: any };
type MenuSection = { title: string; items: MenuItem[] };

const MENU: MenuSection[] = [
  {
    title: "Principal",
    items: [
      { label: "Início", path: "/", icon: Home },
      { label: "Compras (Protheus)", path: "/compras/protheus", icon: ShoppingCart },
      { label: "Recebimentos NF", path: "/recebimentos/nf", icon: FileText },
    ],
  },
  {
    title: "Custos",
    items: [
      { label: "Custos Auto Peças", path: "/custos/autopecas", icon: TrendingUp },
      { label: "Custos Indústria", path: "/custos/industria", icon: TrendingUp },
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
      { label: "Empilhadeiras", path: "/ativos/empilhadeiras", icon: Wrench },
      { label: "Equipamentos Indústria", path: "/ativos/equipamentos-industria", icon: Wrench },
      { label: "Ferramentas", path: "/ativos/ferramentas", icon: Wrench },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { label: "Funcionários", path: "/cadastros/funcionarios", icon: Users },
      { label: "Fornecedores", path: "/cadastros/fornecedores", icon: Truck },
      { label: "Produtos", path: "/cadastros/produtos", icon: Package },
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
      { label: "Usuários", path: "/usuarios", icon: Users },
      { label: "Perfis de Acesso", path: "/perfis-acesso", icon: ShieldCheck },
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
  const { signOut } = useSupabaseAuth();

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
          {!isCollapsed && MENU.map((section) => (
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