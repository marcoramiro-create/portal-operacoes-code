import { LogOut, PackageCheck, PanelLeft, Home, ShoppingCart, FileText, TrendingUp, Boxes, Wrench, Users, ShieldCheck, Building2, MapPin, Package, Truck, ClipboardList, Warehouse, Settings, UploadCloud, Star, LayoutGrid, Coins, Database, Search, ChevronDown, X } from "lucide-react";
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
// MELHORIAS DE VISUAL (02/10/2026):
// - Seções com ícones e nomes padronizados.
// - Item em uso marcado (destaque na página aberta).
// - FAVORITOS fixados no topo, lembrados POR USUÁRIO (localStorage por usuário).
//   As permissões de cada usuário NÃO foram alteradas — só a apresentação.
type TreeNode = { label: string; children?: TreeNode[] };
import { MENU, type MenuItem, type MenuSection } from "./portalMenuModel";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || DEFAULT_WIDTH);
  useEffect(() => localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString()), [sidebarWidth]);
  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent></SidebarProvider>;
}
function DashboardLayoutContent({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (width: number) => void }) {
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar, setOpen, setOpenMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { signOut, portalIdentity, loading: authLoading } = useSupabaseAuth();
  // ----- FILTRO DO MENU POR PERMISSÃO (regra "pai libera filho", 28/09/2026) -----
  const isDevAdmin = Boolean(portalIdentity?.isDevelopmentAdmin);
  const isProductionEnvironment = typeof window !== "undefined" && /(^|-)prod(-|\.|$)/i.test(window.location.hostname);
  const environmentLabel = isProductionEnvironment ? "PRODUÇÃO" : "HOMOLOGAÇÃO";
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
  // ----- FAVORITOS POR USUÁRIO (02/10/2026) -----
  const userId = portalIdentity?.id ?? portalIdentity?.email ?? "anon";
  const FAV_KEY = `portal-favorites-${userId}`;
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { const raw = localStorage.getItem(FAV_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); }, [favorites, FAV_KEY]);
  const SECTION_KEY = `portal-menu-sections-${userId}`;
  const [collapsedSections, setCollapsedSections] = useState<string[]>(() => {
    try { const raw = localStorage.getItem(SECTION_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [menuSearch, setMenuSearch] = useState("");
  useEffect(() => { localStorage.setItem(SECTION_KEY, JSON.stringify(collapsedSections)); }, [collapsedSections, SECTION_KEY]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("portal-menu-search")?.focus();
      }
      if (event.key === "Escape" && document.activeElement?.id === "portal-menu-search") {
        setMenuSearch("");
        (document.activeElement as HTMLElement).blur();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  const toggleFavorite = (path: string) => {
    setFavorites((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));
  };
  // itens favoritos que ainda estão permitidos para este usuário
  const favoriteItems = useMemo(() => {
    const allowed = visibleSections.flatMap((s) => s.items);
    return allowed.filter((i) => favorites.includes(i.path));
  }, [visibleSections, favorites]);
  const filteredSections = useMemo(() => {
    const term = menuSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) return visibleSections;
    return visibleSections
      .map((section) => ({ ...section, items: section.items.filter((item) => item.label.toLocaleLowerCase("pt-BR").includes(term)) }))
      .filter((section) => section.items.length > 0);
  }, [menuSearch, visibleSections]);
  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => prev.includes(title) ? prev.filter((item) => item !== title) : [...prev, title]);
  };
  // ----- FIM DOS FAVORITOS -----
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
  const renderItem = (item: MenuItem) => {
    const isActive = location === item.path || (item.path !== "/" && location.startsWith(`${item.path}/`));
    const isFav = favorites.includes(item.path);
    return (
      <SidebarMenuItem key={item.path + item.label} className="group/item flex items-center gap-1">
        <SidebarMenuButton
          type="button"
          onClick={() => handleNavigate(item.path)}
          tooltip={item.label}
          data-active={isActive}
          className={`min-w-0 flex-1 ${isActive ? "bg-slate-950 text-white hover:bg-slate-950 hover:text-white" : "text-slate-700 hover:bg-white hover:text-slate-950"}`}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate"><span className="block truncate">{item.label}</span>{item.description && !isCollapsed && <span className={`block truncate text-[10px] font-medium ${isActive ? "text-slate-300" : "text-slate-400"}`}>{item.description}</span>}</span>
        </SidebarMenuButton>
        {!isCollapsed && <button type="button" aria-label={isFav ? `Remover ${item.label} dos favoritos` : `Adicionar ${item.label} aos favoritos`} onClick={() => toggleFavorite(item.path)} className={`shrink-0 rounded-md p-1.5 transition-colors hover:bg-white hover:text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${isFav ? "text-amber-500" : "text-slate-400 opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100"}`}><Star className={`h-3.5 w-3.5 ${isFav ? "fill-amber-500" : ""}`} /></button>}
      </SidebarMenuItem>
    );
  };
  return <>
    <div className="relative" ref={sidebarRef}>
      <Sidebar collapsible="icon" className="border-r-0 bg-[#eff2f4]" disableTransition={isResizing}>
        <SidebarHeader className="h-22 justify-center px-3"><div className="flex items-center gap-3 px-1"><button onClick={toggleSidebar} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" aria-label="Alternar navegação"><PanelLeft className="h-4 w-4" /></button>{!isCollapsed && <div className="flex min-w-0 items-center gap-2.5"><div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-[10px] bg-slate-950 text-white"><PackageCheck className="relative z-10 h-4 w-4" /><span className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-[#9fc7ea]" /></div><div className="min-w-0 leading-none"><p className="truncate text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-950">Portal</p><p className="mt-1 truncate text-[11px] font-medium text-slate-500">Operações</p></div></div>}</div>{!isCollapsed && <div className={`mt-2 rounded-md px-2 py-1 text-center text-[9px] font-extrabold uppercase tracking-[0.14em] ${isProductionEnvironment ? "bg-rose-100 text-rose-800" : "bg-sky-100 text-sky-800"}`}>{environmentLabel}</div>}</SidebarHeader>
        <SidebarContent className="gap-0 overflow-y-auto px-2 pt-3">
          {!authLoading && (isMobile || !isCollapsed) && (
            <>
              <div className="mb-4 px-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input id="portal-menu-search" value={menuSearch} onChange={(event) => setMenuSearch(event.target.value)} placeholder="Buscar no menu" aria-label="Buscar no menu" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-xs text-slate-800 outline-none transition-shadow placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-950/10" />
                  {menuSearch ? <button type="button" aria-label="Limpar busca do menu" onClick={() => setMenuSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"><X className="h-3.5 w-3.5" /></button> : <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-200 px-1 text-[9px] text-slate-400">⌘K</kbd>}
                </div>
              </div>
              {favoriteItems.length > 0 && (
                <div className="mb-3">
                  <p className="flex items-center gap-1.5 px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-600"><Star className="h-3 w-3 fill-amber-500" />Favoritos</p>
                  <SidebarMenu>{favoriteItems.map(renderItem)}</SidebarMenu>
                </div>
              )}
              {filteredSections.map((section) => (
                <div key={section.title} className="mb-3">
                  <button type="button" onClick={() => toggleSection(section.title)} aria-expanded={!collapsedSections.includes(section.title)} className="mb-1 flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 transition-colors hover:bg-white hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"><section.icon className="h-3 w-3" /><span className="min-w-0 flex-1"><span className="block">{section.title}</span>{section.description && <span className="block truncate text-[9px] font-medium normal-case tracking-normal text-slate-400">{section.description}</span>}</span><ChevronDown className={`h-3 w-3 transition-transform ${collapsedSections.includes(section.title) ? "-rotate-90" : ""}`} /></button>
                  {(!collapsedSections.includes(section.title) || Boolean(menuSearch)) && <SidebarMenu>{section.items.map(renderItem)}</SidebarMenu>}
                </div>
              ))}
              {menuSearch && filteredSections.length === 0 && <p className="px-3 py-6 text-center text-xs text-slate-500">Nenhum item encontrado.</p>}
            </>
          )}
          <div className="mt-auto border-t border-slate-200/70 px-1 py-3"><SidebarMenu><SidebarMenuItem><SidebarMenuButton type="button" onClick={() => { setOpen(false); if (isMobile) setOpenMobile(false); void handleSignOut(); }} disabled={isSigningOut} tooltip="Sair da aplicação" className="text-slate-700 hover:bg-white hover:text-slate-950"><LogOut className="h-4 w-4" /><span>{isSigningOut ? "Saindo…" : "Sair da aplicação"}</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></div>
        </SidebarContent>
      </Sidebar>
      <div className={`absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize transition-colors hover:bg-slate-950/10 ${isCollapsed ? "hidden" : ""}`} onMouseDown={() => setIsResizing(true)} />
    </div>
    <SidebarInset className="bg-[#f2f4f5]">{isMobile && <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-[#f2f4f5]/90 px-4 backdrop-blur"><SidebarTrigger className="h-9 w-9 rounded-lg bg-white shadow-sm" /><span className="text-sm font-extrabold tracking-tight text-slate-950">Portal</span></header>}<main className="min-h-screen px-4 py-5 sm:px-7 sm:py-8 lg:px-10 lg:py-10">{children}</main></SidebarInset>
  </>;
}
