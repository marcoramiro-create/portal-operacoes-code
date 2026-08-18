import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import Deliveries from "./pages/Deliveries";
import Inventory from "./pages/Inventory";
import NotFound from "./pages/NotFound";
import PurchaseOrders from "./pages/PurchaseOrders";
import Reports from "./pages/Reports";
import Suppliers from "./pages/Suppliers";
import { Route, Switch } from "wouter";

function WithLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function Router() {
  return <Switch>
    <Route path="/"><WithLayout><Dashboard /></WithLayout></Route>
    <Route path="/fornecedores"><WithLayout><Suppliers /></WithLayout></Route>
    <Route path="/pedidos"><WithLayout><PurchaseOrders /></WithLayout></Route>
    <Route path="/estoque"><WithLayout><Inventory /></WithLayout></Route>
    <Route path="/entregas"><WithLayout><Deliveries /></WithLayout></Route>
    <Route path="/relatorios"><WithLayout><Reports /></WithLayout></Route>
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
