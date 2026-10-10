import { ClipboardList, Coins, Database, FileText, Home, LayoutGrid, Package, PackageCheck, PanelLeft, ShieldCheck, ShoppingCart, Star, TrendingUp, Truck, UploadCloud, Users, Warehouse, Wrench, Building2, MapPin, Boxes, Settings } from "lucide-react";

export type MenuItem = { label: string; path: string; icon: any; nodeLabels?: string[]; alwaysVisible?: boolean };
export type MenuSection = { title: string; icon: any; items: MenuItem[] };

/** Árvore visual única: cadastro é mestre; importação carrega dados; operação executa trabalho. */
export const MENU: MenuSection[] = [
  { title: "Início", icon: LayoutGrid, items: [{ label: "Início", path: "/", icon: Home, alwaysVisible: true }] },
  {
    title: "Cadastros",
    icon: Database,
    items: [
      { label: "Empresas", path: "/cadastros/empresas", icon: Building2, nodeLabels: ["Empresas", "Cadastros"] },
      { label: "Filiais", path: "/cadastros/filiais", icon: Building2, nodeLabels: ["Filiais", "Cadastros"] },
      { label: "Unidades", path: "/cadastros/unidades", icon: Building2, nodeLabels: ["Unidades", "Cadastros"] },
      { label: "Centros de Custo", path: "/cadastros/centros-custo", icon: Settings, nodeLabels: ["Centros de Custo", "Cadastros"] },
      { label: "Funcionários", path: "/cadastros/funcionarios", icon: Users, nodeLabels: ["Funcionários", "Cadastros"] },
      { label: "Fornecedores", path: "/cadastros/fornecedores", icon: Truck, nodeLabels: ["Fornecedores", "Cadastros"] },
      { label: "Produtos", path: "/cadastros/produtos", icon: Package, nodeLabels: ["Produtos", "Cadastros"] },
      { label: "Tipos de Produto", path: "/cadastros/tipos-produto", icon: Package, nodeLabels: ["Tipos de Produto", "Cadastros"] },
      { label: "Armazéns", path: "/cadastros/armazens", icon: Warehouse, nodeLabels: ["Armazéns", "Cadastros"] },
      { label: "Locais de Estoque", path: "/cadastros/locais-estoque", icon: MapPin, nodeLabels: ["Locais de Estoque", "Cadastros"] },
      { label: "Empilhadeiras", path: "/cadastros/empilhadeiras", icon: Wrench, nodeLabels: ["Empilhadeiras", "Cadastros"] },
      { label: "Equipamentos Indústria", path: "/cadastros/equipamentos-industria", icon: Wrench, nodeLabels: ["Equipamentos da indústria", "Cadastros"] },
      { label: "Ferramentas", path: "/cadastros/ferramentas", icon: Wrench, nodeLabels: ["Ferramentas", "Cadastros"] },
    ],
  },
  {
    title: "Importações",
    icon: UploadCloud,
    items: [
      { label: "Cadastros Protheus", path: "/importacoes/compras-protheus", icon: UploadCloud, nodeLabels: ["Importar · Análise de compras Protheus", "Importações"] },
      { label: "Funcionários", path: "/importacoes/funcionarios", icon: UploadCloud, nodeLabels: ["Importar Funcionários", "Importações"] },
      { label: "Fornecedores", path: "/importacoes/fornecedores", icon: UploadCloud, nodeLabels: ["Importar Fornecedores", "Importações"] },
      { label: "Produtos", path: "/importacoes/produtos", icon: UploadCloud, nodeLabels: ["Importar Produtos", "Importações"] },
      { label: "Evolução de Custos · Autopeças", path: "/importacoes/custos-autopecas", icon: UploadCloud, nodeLabels: ["Importar · Evolução de custos de autopeças", "Importações"] },
      { label: "Evolução de Custos · Indústria", path: "/importacoes/custos-industria", icon: UploadCloud, nodeLabels: ["Importar · Evolução de custos da indústria", "Importações"] },
      { label: "Entrada de Materiais", path: "/importacoes/entrada-materiais", icon: UploadCloud, nodeLabels: ["Importar · Entrada de materiais", "Importações"] },
    ],
  },
  {
    title: "Operações",
    icon: Boxes,
    items: [
      { label: "Recebimentos NF", path: "/recebimentos/nf", icon: FileText, nodeLabels: ["Leitura de chave de acesso de NF", "Recebimentos"] },
      { label: "Requisições", path: "/almoxarifado/requisicoes", icon: ClipboardList, nodeLabels: ["Requisições", "Almoxarifado"] },
      { label: "Atendimentos", path: "/almoxarifado/atendimentos", icon: PackageCheck, nodeLabels: ["Atendimentos", "Almoxarifado"] },
      { label: "Devoluções", path: "/almoxarifado/devolucoes", icon: Truck, nodeLabels: ["Devoluções", "Almoxarifado"] },
      { label: "Movimentações", path: "/almoxarifado/movimentacoes", icon: Boxes, nodeLabels: ["Movimentações", "Almoxarifado"] },
      { label: "Estoque", path: "/almoxarifado/estoque", icon: Warehouse, nodeLabels: ["Estoque", "Almoxarifado"] },
      { label: "Manutenção de Ativos", path: "/ativos/empilhadeiras", icon: Wrench, nodeLabels: ["Ativos e manutenção"] },
    ],
  },
  {
    title: "Análises",
    icon: TrendingUp,
    items: [
      { label: "Compras (Protheus)", path: "/compras/protheus", icon: ShoppingCart, nodeLabels: ["Compras e análise Protheus", "Importar · Análise de compras Protheus"] },
      { label: "Custos · Autopeças", path: "/custos/autopecas", icon: Coins, nodeLabels: ["Evolução de custos de autopeças", "Suprimentos e estoques"] },
      { label: "Custos · Indústria", path: "/custos/industria", icon: Coins, nodeLabels: ["Evolução de custos da indústria", "Suprimentos e estoques"] },
      { label: "Curva ABC · Indústria", path: "/industria/curva-abc", icon: TrendingUp, nodeLabels: ["Curva ABC da Indústria", "Suprimentos e estoques"] },
    ],
  },
  {
    title: "Administração",
    icon: ShieldCheck,
    items: [
      { label: "Usuários", path: "/usuarios", icon: Users, nodeLabels: ["Usuários e solicitações", "Administração"] },
      { label: "Perfis de Acesso", path: "/perfis-acesso", icon: ShieldCheck, nodeLabels: ["Perfis de acesso", "Administração"] },
      { label: "Auditoria de Cruzamentos", path: "/administracao/auditoria-cruzamentos", icon: ShieldCheck, nodeLabels: ["Auditoria de Cruzamentos", "Administração"] },
      { label: "Backlog da Auditoria", path: "/administracao/auditoria-backlog", icon: ShieldCheck, nodeLabels: ["Backlog da Auditoria", "Administração"] },
    ],
  },
];

export function menuPaths(menu: MenuSection[] = MENU): string[] {
  return menu.flatMap(section => section.items.map(item => item.path));
}
