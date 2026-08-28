import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import { PORTAL_HOME_PATH } from "@/lib/portalNavigation";
import ErrorBoundary from "./components/ErrorBoundary";
import { SupabaseAuthProvider, useSupabaseAuth } from "./contexts/SupabaseAuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import ImportData from "./pages/ImportData";
import NotFound from "./pages/NotFound";
import PortalAccess from "./pages/PortalAccess";
import RegistrationImport from "./pages/RegistrationImport";
import UserManagement from "./pages/UserManagement";
import AccessProfiles from "./pages/AccessProfiles";
import { ApplicationRouteGuard } from "./components/ApplicationRouteGuard";
import NfReceipts from "./pages/NfReceipts";
import InventoryCatalog from "./pages/InventoryCatalog";
import { InventoryFulfillments, InventoryMovements, InventoryRequisitions, InventoryStock } from "./pages/InventoryOperations";
import InventoryTools from "./pages/InventoryTools";
import InventoryReturns from "./pages/InventoryReturns";
import AssetManagement from "./pages/AssetManagement";
import AssetImport from "./pages/AssetImport";
import { Route, Switch } from "wouter";

function WithLayout({ children }: { children: React.ReactNode }) { return <DashboardLayout>{children}</DashboardLayout>; }

function Router() {
  return <Switch>
    <Route path={PORTAL_HOME_PATH}><WithLayout><Home /></WithLayout></Route>
    <Route path="/compras/protheus"><WithLayout><ApplicationRouteGuard nodeKey="compras-protheus"><Dashboard /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importacoes/compras-protheus"><WithLayout><ApplicationRouteGuard nodeKey="importacoes-compras-protheus" level="manage"><ImportData /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importacoes/empresas"><WithLayout><ApplicationRouteGuard nodeKey="importacoes-empresas" level="manage"><InventoryCatalog initialTab="companies" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importacoes/filiais"><WithLayout><ApplicationRouteGuard nodeKey="importacoes-filiais" level="manage"><InventoryCatalog initialTab="branches" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importacoes/armazens"><WithLayout><ApplicationRouteGuard nodeKey="importacoes-armazens" level="manage"><InventoryCatalog initialTab="warehouses" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importacoes/locais-estoque"><WithLayout><ApplicationRouteGuard nodeKey="importacoes-locais-estoque" level="manage"><InventoryCatalog initialTab="locations" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importacoes/unidades"><WithLayout><ApplicationRouteGuard nodeKey="importacoes-unidades" level="manage"><InventoryCatalog initialTab="orgUnits" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importacoes/centros-custo"><WithLayout><ApplicationRouteGuard nodeKey="importacoes-centros-custo" level="manage"><InventoryCatalog initialTab="costCenters" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importacoes/tipos-produto"><WithLayout><ApplicationRouteGuard nodeKey="importacoes-tipos-produto" level="manage"><InventoryCatalog initialTab="types" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importacoes/usuarios"><WithLayout><ApplicationRouteGuard nodeKey="importacoes-usuarios" level="manage"><RegistrationImport type="users" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importacoes/funcionarios"><WithLayout><ApplicationRouteGuard nodeKey="importacoes-funcionarios" level="manage"><RegistrationImport type="employees" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importacoes/fornecedores"><WithLayout><ApplicationRouteGuard nodeKey="importacoes-fornecedores" level="manage"><RegistrationImport type="suppliers" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importacoes/produtos"><WithLayout><ApplicationRouteGuard nodeKey="importacoes-produtos" level="manage"><RegistrationImport type="products" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importacoes/ativos-empilhadeiras"><WithLayout><ApplicationRouteGuard nodeKey="importacoes-ativos-empilhadeiras" level="manage"><AssetImport type="forklift" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importacoes/ativos-equipamentos-industria"><WithLayout><ApplicationRouteGuard nodeKey="importacoes-ativos-equipamentos-industria" level="manage"><AssetImport type="industrial_equipment" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importacoes/ativos-ferramentas"><WithLayout><ApplicationRouteGuard nodeKey="importacoes-ativos-ferramentas" level="manage"><AssetImport type="tool" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/importar"><WithLayout><ApplicationRouteGuard nodeKey="importacoes-compras-protheus" level="manage"><ImportData /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/usuarios"><WithLayout><UserManagement /></WithLayout></Route>
    <Route path="/perfis-acesso"><WithLayout><AccessProfiles /></WithLayout></Route>
    <Route path="/recebimentos/nf"><WithLayout><ApplicationRouteGuard nodeKey="chaves-nf"><NfReceipts /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/cadastros/empresas"><WithLayout><InventoryCatalog initialTab="companies" /></WithLayout></Route>
    <Route path="/cadastros/filiais"><WithLayout><InventoryCatalog initialTab="branches" /></WithLayout></Route>
    <Route path="/cadastros/armazens"><WithLayout><InventoryCatalog initialTab="warehouses" /></WithLayout></Route>
    <Route path="/cadastros/locais-estoque"><WithLayout><InventoryCatalog initialTab="locations" /></WithLayout></Route>
    <Route path="/cadastros/unidades"><WithLayout><InventoryCatalog initialTab="orgUnits" /></WithLayout></Route>
    <Route path="/cadastros/centros-custo"><WithLayout><InventoryCatalog initialTab="costCenters" /></WithLayout></Route>
    <Route path="/cadastros/tipos-produto"><WithLayout><InventoryCatalog initialTab="types" /></WithLayout></Route>
    <Route path="/almoxarifado/requisicoes"><WithLayout><ApplicationRouteGuard nodeKey="almoxarifado-requisicoes"><InventoryRequisitions /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/almoxarifado/atendimentos"><WithLayout><ApplicationRouteGuard nodeKey="almoxarifado-atendimentos"><InventoryFulfillments /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/almoxarifado/devolucoes"><WithLayout><ApplicationRouteGuard nodeKey="almoxarifado-devolucoes"><InventoryReturns /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/almoxarifado/movimentacoes"><WithLayout><ApplicationRouteGuard nodeKey="almoxarifado-movimentacoes"><InventoryMovements /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/almoxarifado/estoque"><WithLayout><ApplicationRouteGuard nodeKey="almoxarifado-estoque"><InventoryStock /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/almoxarifado/ferramentas"><WithLayout><ApplicationRouteGuard nodeKey="almoxarifado-ferramentas"><InventoryTools /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/ativos/empilhadeiras"><WithLayout><ApplicationRouteGuard nodeKey="ativos-empilhadeiras"><AssetManagement type="forklift" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/ativos/equipamentos-industria"><WithLayout><ApplicationRouteGuard nodeKey="ativos-equipamentos-industria"><AssetManagement type="industrial_equipment" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/ativos/ferramentas"><WithLayout><ApplicationRouteGuard nodeKey="ativos-ferramentas"><AssetManagement type="tool" /></ApplicationRouteGuard></WithLayout></Route>
    <Route path="/cadastros/usuarios"><WithLayout><ApplicationRouteGuard nodeKey="cadastros-usuarios"><RegistrationImport type="users" /></ApplicationRouteGuard></WithLayout></Route>
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
