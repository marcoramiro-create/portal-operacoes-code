import { BarChart3, FileUp, PackageCheck, PanelLeft } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
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
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import ApplicationTree from "./ApplicationTree";

const menuItems = [
  { icon: BarChart3, label: "Painel", path: "/" },
  { icon: FileUp, label: "Importar planilha", path: "/importar" },
];

const SIDEBAR_WIDTH_KEY = "portal-sidebar-width";
const DEFAULT_WIDTH = 270;
const MIN_WIDTH = 224;
const MAX_WIDTH = 390;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || DEFAULT_WIDTH);
  useEffect(() => localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString()), [sidebarWidth]);
  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent></SidebarProvider>;
}

function DashboardLayoutContent({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (width: number) => void }) {
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const activeItem = menuItems.find(item => item.path === location);
  const { data: applicationTree = [] } = trpc.portal.applicationTree.useQuery(undefined, { retry: false });

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!isResizing) return;
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const width = event.clientX - left;
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width);
    };
    const up = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.body.style.cursor = ""; document.body.style.userSelect = ""; };
  }, [isResizing, setSidebarWidth]);

  return <>
    <div className="relative" ref={sidebarRef}>
      <Sidebar collapsible="icon" className="border-r-0 bg-[#eff2f4]" disableTransition={isResizing}>
        <SidebarHeader className="h-22 justify-center px-3"><div className="flex items-center gap-3 px-1"><button onClick={toggleSidebar} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" aria-label="Alternar navegação"><PanelLeft className="h-4 w-4" /></button>{!isCollapsed && <div className="flex min-w-0 items-center gap-2.5"><div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-[10px] bg-slate-950 text-white"><PackageCheck className="relative z-10 h-4 w-4" /><span className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-[#9fc7ea]" /></div><div className="min-w-0 leading-none"><p className="truncate text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-950">Portal</p><p className="mt-1 truncate text-[11px] font-medium text-slate-500">Operações</p></div></div>}</div></SidebarHeader>
        <SidebarContent className="gap-0 overflow-y-auto px-2 pt-3"><SidebarMenu className="gap-1">{menuItems.map(item => { const active = item.path === location; return <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={active} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-11 rounded-xl px-3 text-[13px] font-semibold text-slate-600 transition-all data-[active=true]:bg-white data-[active=true]:text-slate-950 data-[active=true]:shadow-[0_6px_18px_rgba(50,70,90,0.06)]"><item.icon className={`h-[17px] w-[17px] ${active ? "text-slate-950" : "text-slate-500"}`} /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>; })}</SidebarMenu>{!isCollapsed && applicationTree.length > 0 && <ApplicationTree nodes={applicationTree} />}</SidebarContent>
      </Sidebar>
      <div className={`absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize transition-colors hover:bg-slate-950/10 ${isCollapsed ? "hidden" : ""}`} onMouseDown={() => setIsResizing(true)} />
    </div>
    <SidebarInset className="bg-[#f2f4f5]">{isMobile && <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-[#f2f4f5]/90 px-4 backdrop-blur"><SidebarTrigger className="h-9 w-9 rounded-lg bg-white shadow-sm" /><span className="text-sm font-extrabold tracking-tight text-slate-950">{activeItem?.label ?? "Portal"}</span></header>}<main className="min-h-screen px-4 py-5 sm:px-7 sm:py-8 lg:px-10 lg:py-10">{children}</main></SidebarInset>
  </>;
}
