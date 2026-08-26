import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { SupabaseAuthProvider, useSupabaseAuth } from "./contexts/SupabaseAuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import ImportData from "./pages/ImportData";
import NotFound from "./pages/NotFound";
import PortalAccess from "./pages/PortalAccess";
import RegistrationImport from "./pages/RegistrationImport";
import UserManagement from "./pages/UserManagement";
import AccessProfiles from "./pages/AccessProfiles";
import { ApplicationRouteGuard } from "./components/ApplicationRouteGuard";
import NfReceipts from "./pages/NfReceipts";
import { Route, Switch } from "wouter";

function WithLayout({ children }: { children: React.ReactNode }) { return <DashboardLayout>{children}</DashboardLayout>; }

function Router() {
  return <Switch>
    <Route path="/"><WithLayout><ApplicationRouteGuard nodeKey="compras-protheus"><Dashboard /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importar"><WithLayout><ApplicationRouteGuard nodeKey="compras-protheus" level="manage"><ImportData /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/usuarios"><WithLayout><UserManagement /></WithLayout></Route>
    <Route path="/perfis-acesso"><WithLayout><AccessProfiles /></WithLayout></Route>
    <Route path="/recebimentos/nf"><WithLayout><ApplicationRouteGuard nodeKey="chaves-nf"><NfReceipts /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/cadastros/usuarios"><WithLayout><RegistrationImport type="users" /></WithLayout></Route>
    <Route path="/cadastros/funcionarios"><WithLayout><RegistrationImport type="employees" /></WithLayout></Route>
    <Route path="/cadastros/fornecedores"><WithLayout><RegistrationImport type="suppliers" /></WithLayout></Route>
    <Route path="/cadastros/produtos"><WithLayout><RegistrationImport type="products" /></WithLayout></Route>
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

function AuthGate() {
  const { session, loading, passwordSetupRequired } = useSupabaseAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#f2f4f5]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-950" /></div>;
  if (!session || passwordSetupRequired) return <PortalAccess />;
  return <Router />;
}

export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><SupabaseAuthProvider><Toaster /><AuthGate /></SupabaseAuthProvider></TooltipProvider></ThemeProvider></ErrorBoundary>; }
