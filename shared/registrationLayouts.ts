export const registrationTypes = ["users", "employees", "suppliers", "products"] as const;
export type RegistrationType = typeof registrationTypes[number];

export type RegistrationColumn = {
  key: string;
  label: string;
  required?: boolean;
  hint: string;
};

export type RegistrationLayout = {
  key: RegistrationType;
  label: string;
  sheetName: string;
  fileName: string;
  description: string;
  columns: RegistrationColumn[];
};

export const registrationLayouts: Record<RegistrationType, RegistrationLayout> = {
  users: {
    key: "users", label: "Usuários", sheetName: "Usuarios", fileName: "leiaute-usuarios", description: "Cria usuários pendentes de ativação. O convite é enviado posteriormente, de forma controlada, pela Administração.",
    columns: [
      { key: "nome", label: "Nome", required: true, hint: "Nome completo do usuário." },
      { key: "email", label: "E-mail", required: true, hint: "E-mail único que será usado para entrar no portal." },
      { key: "perfil", label: "Perfil", required: true, hint: "Use: operations-admin, manager, operator ou viewer." },
      { key: "ativo", label: "Ativo", hint: "SIM ou NÃO. Em branco equivale a SIM." },
    ],
  },
  employees: {
    key: "employees", label: "Funcionários", sheetName: "Funcionarios", fileName: "leiaute-funcionarios", description: "Cadastro de pessoas para vínculos operacionais, consumo e entrega de materiais.",
    columns: [
      { key: "codigo_funcionario", label: "Código do funcionário", required: true, hint: "Código único da pessoa no ERP ou controle interno." },
      { key: "nome_completo", label: "Nome completo", required: true, hint: "Nome completo do funcionário." },
      { key: "email", label: "E-mail", hint: "E-mail corporativo, se houver." },
      { key: "codigo_unidade", label: "Código da unidade", hint: "Código já cadastrado em Unidades; deixe em branco se não se aplicar." },
      { key: "codigo_centro_custo", label: "Código do centro de custo", hint: "Código já cadastrado em Centros de custo; deixe em branco se não se aplicar." },
      { key: "ativo", label: "Ativo", hint: "SIM ou NÃO. Em branco equivale a SIM." },
    ],
  },
  suppliers: {
    key: "suppliers", label: "Fornecedores", sheetName: "Fornecedores", fileName: "leiaute-fornecedores", description: "Cadastro básico de fornecedores para recebimentos, rankings e análises futuras.",
    columns: [
      { key: "codigo_fornecedor", label: "Código do fornecedor", required: true, hint: "Código único do fornecedor." },
      { key: "razao_social", label: "Razão social", required: true, hint: "Nome empresarial completo." },
      { key: "nome_fantasia", label: "Nome fantasia", hint: "Nome comercial, se houver." },
      { key: "cnpj_cpf", label: "CNPJ ou CPF", hint: "Somente números ou pontuação; deve ser único quando informado." },
      { key: "ativo", label: "Ativo", hint: "SIM ou NÃO. Em branco equivale a SIM." },
    ],
  },
  products: {
    key: "products", label: "Produtos", sheetName: "Produtos", fileName: "leiaute-produtos", description: "Cadastro único de itens de compra, consumo, EPI, uniforme e ferramenta para recebimento, estoque e operações posteriores.",
    columns: [
      { key: "codigo_produto", label: "Código do produto", required: true, hint: "Código único do item no ERP ou controle interno." },
      { key: "nome_produto", label: "Nome do produto", required: true, hint: "Descrição objetiva do produto." },
      { key: "codigo_tipo_produto", label: "Código do tipo de produto", required: true, hint: "Código já cadastrado em Tipos de produto; por exemplo, EPI ou FERR." },
      { key: "categoria_operacional", label: "Categoria operacional", required: true, hint: "Use: consumível, EPI, uniforme, ferramenta ou outro." },
      { key: "unidade_medida", label: "Unidade de medida", required: true, hint: "Exemplos: UN, PAR, CX, KG ou L." },
      { key: "controla_tamanho", label: "Controla tamanho", hint: "SIM ou NÃO. Use SIM para uniformes e itens dimensionados." },
      { key: "controla_lote", label: "Controla lote", hint: "SIM ou NÃO." },
      { key: "controla_validade", label: "Controla validade", hint: "SIM ou NÃO." },
      { key: "controla_ca", label: "Controla CA", hint: "SIM ou NÃO. Use SIM quando o EPI exigir Certificado de Aprovação." },
      { key: "ativo", label: "Ativo", hint: "SIM ou NÃO. Em branco equivale a SIM." },
    ],
  },
};

export function isRegistrationType(value: string): value is RegistrationType {
  return registrationTypes.includes(value as RegistrationType);
}

export function normalizeCell(value: unknown) {
  return String(value ?? "").trim();
}

export function parseActive(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || ["sim", "s", "true", "1", "ativo"].includes(normalized)) return { valid: true, value: true };
  if (["não", "nao", "n", "false", "0", "inativo"].includes(normalized)) return { valid: true, value: false };
  return { valid: false, value: true };
}

export function parseYesNo(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || ["não", "nao", "n", "false", "0"].includes(normalized)) return { valid: true, value: false };
  if (["sim", "s", "true", "1"].includes(normalized)) return { valid: true, value: true };
  return { valid: false, value: false };
}
