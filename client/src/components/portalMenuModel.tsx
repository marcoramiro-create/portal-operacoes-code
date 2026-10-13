import { ClipboardList, Coins, Database, FileText, Home, LayoutGrid, Package, PackageCheck, ShieldCheck, ShoppingCart, Star, TrendingUp, Truck, UploadCloud, Users, Warehouse, Wrench, Building2, MapPin, Boxes, Settings } from "lucide-react";

export type MenuItem = { label: string; description?: string; path: string; icon: any; nodeLabels?: string[]; alwaysVisible?: boolean };
export type MenuSection = { title: string; description?: string; icon: any; items: MenuItem[] };

/** Navegação por processo: cadastro mestre → carga de dados → operação → análise. */
export const MENU: MenuSection[] = [
  { title: "Início", description: "Acompanhe por onde começar.", icon: LayoutGrid, items: [{ label: "Início", description: "Escolha uma área de trabalho.", path: "/", icon: Home, alwaysVisible: true }] },
  {
    title: "Cadastros", description: "Dados mestres usados por todo o portal.", icon: Database, items: [
      { label: "Empresas", description: "Empresas do grupo.", path: "/cadastros/empresas", icon: Building2, nodeLabels: ["Empresas", "Cadastros"] },
      { label: "Filiais", description: "Filiais por empresa.", path: "/cadastros/filiais", icon: Building2, nodeLabels: ["Filiais", "Cadastros"] },
      { label: "Unidades", description: "Unidades e operações.", path: "/cadastros/unidades", icon: Building2, nodeLabels: ["Unidades", "Cadastros"] },
      { label: "Centros de custo", description: "Classificação organizacional.", path: "/cadastros/centros-custo", icon: Settings, nodeLabels: ["Centros de Custo", "Cadastros"] },
      { label: "Funcionários", description: "Pessoas, PF/PJ e cartão.", path: "/cadastros/funcionarios", icon: Users, nodeLabels: ["Funcionários", "Cadastros"] },
      { label: "Fornecedores", description: "Parceiros e dados fiscais.", path: "/cadastros/fornecedores", icon: Truck, nodeLabels: ["Fornecedores", "Cadastros"] },
      { label: "Produtos", description: "Itens e características.", path: "/cadastros/produtos", icon: Package, nodeLabels: ["Produtos", "Cadastros"] },
      { label: "Tipos de produto", description: "Classificação dos itens.", path: "/cadastros/tipos-produto", icon: Package, nodeLabels: ["Tipos de Produto", "Cadastros"] },
      { label: "Armazéns", description: "Estruturas de estoque.", path: "/cadastros/armazens", icon: Warehouse, nodeLabels: ["Armazéns", "Cadastros"] },
      { label: "Locais de estoque", description: "Endereços dentro do armazém.", path: "/cadastros/locais-estoque", icon: MapPin, nodeLabels: ["Locais de Estoque", "Cadastros"] },
      { label: "Empilhadeiras", description: "Cadastro e manutenção.", path: "/cadastros/empilhadeiras", icon: Wrench, nodeLabels: ["Empilhadeiras", "Cadastros"] },
      { label: "Equipamentos da indústria", description: "Ativos industriais.", path: "/cadastros/equipamentos-industria", icon: Wrench, nodeLabels: ["Equipamentos da indústria", "Cadastros"] },
      { label: "Ferramentas", description: "Controle de ferramentas.", path: "/cadastros/ferramentas", icon: Wrench, nodeLabels: ["Ferramentas", "Cadastros"] },
    ],
  },
  {
    title: "Importações", description: "Traga arquivos para o portal e confira o histórico.", icon: UploadCloud, items: [
      { label: "Fontes Protheus", description: "Compras, SB1, SBZ e referências.", path: "/importacoes/compras-protheus", icon: UploadCloud, nodeLabels: ["Importar · Análise de compras Protheus", "Importações"] },
      { label: "Histórico de cargas", description: "Veja o que, quando e quanto foi importado.", path: "/importacoes/historico", icon: FileText, nodeLabels: ["Histórico de importações", "Importações"] },
      { label: "Funcionários", description: "Importe o cadastro de pessoas.", path: "/importacoes/funcionarios", icon: UploadCloud, nodeLabels: ["Importar Funcionários", "Importações"] },
      { label: "Fornecedores", description: "Importe parceiros comerciais.", path: "/importacoes/fornecedores", icon: UploadCloud, nodeLabels: ["Importar Fornecedores", "Importações"] },
      { label: "Produtos", description: "Importe itens e atributos.", path: "/importacoes/produtos", icon: UploadCloud, nodeLabels: ["Importar Produtos", "Importações"] },
      { label: "Custos · Autopeças", description: "Importe a evolução mensal de peças.", path: "/importacoes/custos-autopecas", icon: UploadCloud, nodeLabels: ["Importar · Evolução de custos de autopeças", "Importações"] },
      { label: "Custos · Indústria", description: "Importe a evolução mensal industrial.", path: "/importacoes/custos-industria", icon: UploadCloud, nodeLabels: ["Importar · Evolução de custos da indústria", "Importações"] },
      { label: "Entradas · Indústria", description: "Importe entradas de materiais do RM BIS.", path: "/importacoes/entrada-materiais", icon: UploadCloud, nodeLabels: ["Importar · Entrada de materiais", "Importações"] },
      { label: "Evolução de estoque · Indústria", description: "Importe o fechamento mensal do estoque.", path: "/importacoes/estoque-industria", icon: UploadCloud, nodeLabels: ["Importar · Evolução de estoque da indústria", "Importações"] },
    ],
  },
  {
    title: "Operações", description: "Execute o trabalho do dia a dia.", icon: Boxes, items: [
      { label: "Recebimentos NF", description: "Leia e acompanhe chaves de NF.", path: "/recebimentos/nf", icon: FileText, nodeLabels: ["Leitura de chave de acesso de NF", "Recebimentos"] },
      { label: "Requisições", description: "Solicite materiais.", path: "/almoxarifado/requisicoes", icon: ClipboardList, nodeLabels: ["Requisições", "Almoxarifado"] },
      { label: "Atendimentos", description: "Separe e entregue itens.", path: "/almoxarifado/atendimentos", icon: PackageCheck, nodeLabels: ["Atendimentos", "Almoxarifado"] },
      { label: "Devoluções", description: "Registre retornos ao estoque.", path: "/almoxarifado/devolucoes", icon: Truck, nodeLabels: ["Devoluções", "Almoxarifado"] },
      { label: "Movimentações", description: "Registre entradas e transferências.", path: "/almoxarifado/movimentacoes", icon: Boxes, nodeLabels: ["Movimentações", "Almoxarifado"] },
      { label: "Estoque", description: "Consulte saldos por local.", path: "/almoxarifado/estoque", icon: Warehouse, nodeLabels: ["Estoque", "Almoxarifado"] },
      { label: "Manutenção de ativos", description: "Acompanhe equipamentos e ferramentas.", path: "/ativos/empilhadeiras", icon: Wrench, nodeLabels: ["Ativos e manutenção"] },
    ],
  },
  {
    title: "Análises", description: "Transforme os dados em decisão.", icon: TrendingUp, items: [
      { label: "Compras Protheus", description: "Consumo, estoque, giro e cobertura.", path: "/compras/protheus", icon: ShoppingCart, nodeLabels: ["Compras e análise Protheus", "Importar · Análise de compras Protheus"] },
      { label: "Custos · Autopeças", description: "Variação de custos e Curva de Compras.", path: "/custos/autopecas", icon: Coins, nodeLabels: ["Evolução de custos de autopeças", "Suprimentos e estoques"] },
      { label: "Custos · Indústria", description: "Variação de custos e Curva da Indústria.", path: "/custos/industria", icon: Coins, nodeLabels: ["Evolução de custos da indústria", "Suprimentos e estoques"] },
      { label: "Curva ABC · Indústria", description: "Calcule e confira a classificação industrial.", path: "/industria/curva-abc", icon: TrendingUp, nodeLabels: ["Curva ABC da Indústria", "Suprimentos e estoques"] },
    ],
  },
  {
    title: "Administração", description: "Acessos, permissões e controles.", icon: ShieldCheck, items: [
      { label: "Usuários", description: "Ative, inative e revise acessos.", path: "/usuarios", icon: Users, nodeLabels: ["Usuários e solicitações", "Administração"] },
      { label: "Perfis de acesso", description: "Defina consultar, administrar e aprovar.", path: "/perfis-acesso", icon: ShieldCheck, nodeLabels: ["Perfis de acesso", "Administração"] },
      { label: "Auditoria de cruzamentos", description: "Verifique vínculos e inconsistências.", path: "/administracao/auditoria-cruzamentos", icon: ShieldCheck, nodeLabels: ["Auditoria de Cruzamentos", "Administração"] },
      { label: "Backlog da auditoria", description: "Acompanhe pendências de qualidade.", path: "/administracao/auditoria-backlog", icon: ShieldCheck, nodeLabels: ["Backlog da Auditoria", "Administração"] },
    ],
  },
];

export function menuPaths(menu: MenuSection[] = MENU): string[] { return menu.flatMap(section => section.items.map(item => item.path)); }
