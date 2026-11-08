// ============================================================
// onedriveSummarySchemas.ts — CONFIGURAÇÃO das versões resumidas
// ============================================================
// Este é o ÚNICO arquivo que muda quando um produto novo entra.
// O serviço (onedriveSummaryWriter.ts) e o job
// (scripts/protheusSummaryUpload.ts) não conhecem produto
// específico: recebem um ProductCode e buscam o schema aqui.
//
// PARA ATIVAR UM PRODUTO NOVO:
//   1. Preencha folder, fileName, columns e requiredColumns
//   2. Rode os testes — o teste "produto não configurado" vai falhar
//      para esse produto, avisando que ele agora está ativo
//   3. Nenhuma alteração no serviço é necessária
//
// SELEÇÃO APROVADA POR MARCO EM 08/11/2026 — critério "máximo
// viável" (pecar pelo excesso, não pela escassez). Colunas com os
// NOMES EXATOS dos cabeçalhos da exportação Protheus de 08/11.
// SB2 segue VAZIO de propósito: sem especificação ainda.
// ============================================================

export type ProductCode =
  | "SB9"
  | "SB2"
  | "SC7"
  | "SD1"
  | "SA1"
  | "SA2"
  | "SA3"
  | "SA4"
  | "SA5"
  | "SB1"
  | "SB5"
  | "SBZ"
  | "SD2"
  | "SF1"
  | "SF2"
  | "SF4";

export type ProductSchema = {
  /** Subpasta no OneDrive, relativa à raiz do drive. Ex.: "Cadastros/SB9_REDUZIDAS" */
  folder: string;
  /** Nome do arquivo resumido. Sempre sobrescrito (write-then-delete). */
  fileName: string;
  /** Colunas a manter, na ordem em que devem aparecer no arquivo resumido. */
  columns: string[];
  /** Subconjunto de columns que DEVE existir no original. Ausência = erro explícito. */
  requiredColumns: string[];
};

/**
 * Mapa de schemas por produto.
 *
 * SB9 preenchido conforme o documento
 * 20261030-CLAUDE-INSTRUCOES-MANUS-PIPELINE-SB9-E-REPLICACAO.docx (seção 5).
 *
 * Demais produtos preenchidos em 08/11/2026 com a seleção aprovada
 * pelo Marco (cabeçalhos exatos da exportação Protheus).
 *
 * SB2 permanece VAZIO de propósito: o serviço falha explicitamente
 * se for chamado, em vez de gravar arquivo vazio ou corrompido.
 */
export const SUMMARY_SCHEMAS: Record<ProductCode, ProductSchema> = {
  SB9: {
    folder: "Cadastros/SB9_REDUZIDAS",
    fileName: "SB9-resumida.csv",
    columns: [
      "Filial",
      "Produto",
      "Armazem",
      "Data Saldo",
      "C Unit 1a M",
      "Qtd.Inic.Mes",
      "Sld.Ini.Mes",
      "Grupo",
      "Cod. Produto",
      "Custo Stand.",
    ],
    requiredColumns: ["Filial", "Produto", "Grupo", "Cod. Produto"],
  },

  // ─── A PREENCHER ────────────────────────────────────────
  SB2: { folder: "", fileName: "", columns: [], requiredColumns: [] },

  // ─── MOVIMENTOS ─────────────────────────────────────────
  SC7: {
    folder: "Cadastros/SC7_REDUZIDAS",
    fileName: "SC7-resumida.csv",
    columns: [
      "Filial", "Tipo", "Item", "Produto", "Produto SC", "Descricao", "Desc Interna",
      "Quantidade", "Unidade", "Ult.Compra", "Prc Unitario", "% Desc.Item",
      "Desconto 1", "Desconto 2", "Desconto 3", "Prev Entrega", "Entrega", "Vlr.Total",
      "Tp Pedido", "Endereco", "Nome Fornec", "Status Pedid", "Cond. Pagto",
      "DT Emissao", "Numero PC", "Qtd.Entregue", "Qtd.a Classi", "Fornecedor", "Loja",
      "Centro Custo", "Filial Entr.", "Armazem", "Cod. Usuario", "Solicitante",
      "Observacoes", "Num. PO", "Cod.Comprad.", "Tipo Compra",
    ],
    requiredColumns: ["Filial", "Item", "Produto", "Quantidade", "DT Emissao", "Fornecedor", "Loja"],
  },
  SD1: {
    folder: "Cadastros/SD1_REDUZIDAS",
    fileName: "SD1-resumida.csv",
    columns: [
      "Filial", "Item NF", "Produto", "Desc.Produto", "Desc Interna", "Unidade",
      "NCM Prod.", "Quantidade", "Vlr.Unitario", "Vlr.Total", "Forn/Cliente", "Loja",
      "Documento", "Serie", "DT Emissao", "No do Pedido", "Item do Ped.", "Armazem",
      "DT Digitacao", "DT Custo", "Cod. Fiscal", "Tipo Entrada", "Qtde Pedido",
      "Qtd Entregue", "Peso total", "Vlr. Frete", "Vlr. Seguro", "Vlr. Despesa",
      "Num.Sequenc.", "Status Serv.",
    ],
    requiredColumns: ["Filial", "Item NF", "Produto", "Quantidade", "Documento", "DT Emissao", "Forn/Cliente", "Loja"],
  },
  SD2: {
    folder: "Cadastros/SD2_REDUZIDAS",
    fileName: "SD2-resumida.csv",
    columns: [
      "Filial", "Item", "Produto", "Segunda UM", "Unidade", "Quantidade",
      "Vlr.Unitario", "Vlr.Total", "Vlr.IPI", "Vlr.ICMS", "Tipo Saida", "Cod. Fiscal",
      "Desc.Item", "Aliq. ICMS", "Peso total", "No do Pedido", "Cliente", "Loja",
      "Item do Ped.", "Num. Docto.", "Armazem", "Serie", "Emissao", "Custo",
      "Vendedor", "Estado Dest.",
    ],
    requiredColumns: ["Filial", "Item", "Produto", "Quantidade", "Num. Docto.", "Emissao", "Cliente", "Loja"],
  },
  SF1: {
    folder: "Cadastros/SF1_REDUZIDAS",
    fileName: "SF1-resumida.csv",
    columns: [
      "Filial", "Numero", "Serie", "Dt. Receb.", "Fornecedor", "Loja", "Nome Forn.",
      "Cond. Pagto", "Num. Titulo", "DT Emissao", "Estado", "Vlr.Frete",
      "Vlr.Despesas", "Vlr.Seguro", "Base p/ICMS", "Vlr.ICMS", "Base p/IPI",
      "Vlr.IPI", "Vlr.Mercad", "Vlr.Bruto", "Tipo da Nota", "Descontos",
      "Dt.Digitacao", "Status",
    ],
    requiredColumns: ["Filial", "Numero", "Serie", "Fornecedor", "Loja", "DT Emissao"],
  },
  SF2: {
    folder: "Cadastros/SF2_REDUZIDAS",
    fileName: "SF2-resumida.csv",
    columns: [
      "Numero", "Serie Docto.", "NF Eletr.", "DT Emissao", "Cliente", "Loja",
      "Nome Cliente", "Insc. Est.", "Estado", "Num. Titulo", "Cond. Pagto",
      "Vlr.Frete", "Vlr.Seguro", "Vlr.Bruto", "Vlr.ICMS", "Base p/ICMS", "Vlr.IPI",
      "Vlr.Mercad", "Descontos", "Tipo da nota", "Vendedor 1", "Transp.",
    ],
    requiredColumns: ["Numero", "Serie Docto.", "DT Emissao", "Cliente", "Loja"],
  },

  // ─── CADASTROS ──────────────────────────────────────────
  SA1: {
    folder: "Cadastros/SA1_REDUZIDAS",
    fileName: "SA1-resumida.csv",
    columns: [
      "Codigo", "Loja", "Fisica/Jurid", "CNPJ/CPF", "Nome", "N Fantasia",
      "Endereco", "Complemento", "CEP", "Bairro", "Municipio", "Estado",
      "Telefone", "Celular", "E-Mail", "Tipo", "Contato", "Cond. Pagto",
      "Status", "Vendedor PEC",
    ],
    requiredColumns: ["Codigo", "Loja", "Nome"],
  },
  SA2: {
    folder: "Cadastros/SA2_REDUZIDAS",
    fileName: "SA2-resumida.csv",
    columns: [
      "Codigo", "Loja", "Tipo", "CNPJ/CPF", "Cod.IBGE", "Razao Social",
      "N Fantasia", "Endereço", "Numero", "CEP", "Caixa Postal", "Bairro",
      "Municipio", "Estado", "DDD", "Telefone", "Celular", "Contato", "E-Mail",
      "Natureza", "Cond. Pagto", "Status", "Grupo", "Fabricante", "Contato Com.",
    ],
    requiredColumns: ["Codigo", "Loja", "Razao Social"],
  },
  SA3: {
    folder: "Cadastros/SA3_REDUZIDAS",
    fileName: "SA3-resumida.csv",
    columns: [
      "Codigo", "Nome", "Nome Reduzid", "Endereco", "Bairro", "Municipio",
      "Estado", "CEP", "DDD", "Telefone", "FAX", "Tipo", "CNPJ/CPF",
      "Ins. Estad.", "E-Mail", "Supervisor", "Gerente", "Filial Vend",
      "Regiao", "Comissao", "Tipo Vend.", "Bloqueado?",
    ],
    requiredColumns: ["Codigo", "Nome"],
  },
  SA4: {
    folder: "Cadastros/SA4_REDUZIDAS",
    fileName: "SA4-resumida.csv",
    columns: [
      "Codigo", "CNPJ/CPF", "Bairro", "Nome", "Nome Reduz.", "Via Transp.",
      "Estado", "CEP", "Endereco", "Complemento", "Municipio", "DDI", "DDD",
      "Telefone", "Insc.Estad.", "E-Mail", "Contato", "Est. Fisica",
      "End. Padrão", "Local", "Tp. trans.", "RNTRC",
    ],
    requiredColumns: ["Codigo", "Nome"],
  },
  SA5: {
    folder: "Cadastros/SA5_REDUZIDAS",
    fileName: "SA5-resumida.csv",
    columns: [
      "Fornecedor", "Loja", "Nome", "Produto", "Descricao", "Cod.Prod.For",
      "1a. Quant.", "2a. Quant.", "3a. Quant.", "4a. Quant.", "5a. Quant.",
      "6a. Quant.", "7a. Quant.", "8a. Quant.", "9a. Quant.", "10a. Quant.",
      "11a. Quant.", "12a. Quant.",
      "1o. Preco", "2o. Preco", "3o. Preco", "4o. Preco", "5o. Preco",
      "6o. Preco", "7o. Preco", "8o. Preco", "9o. Preco", "10o. Preco",
      "11o. Preco", "12o. Preco",
      "1a. Data", "2a. Data", "3a. Data", "4a. Data",
      "Lead Time", "Lote Minimo", "Lote Multip.", "Moeda Utiliz", "Status",
      "Fabricante", "Vlr.Ult.FOB", "Ult. Entrega", "Quant.Cotada",
    ],
    requiredColumns: ["Fornecedor", "Loja", "Produto"],
  },
  SB1: {
    folder: "Cadastros/SB1_REDUZIDAS",
    fileName: "SB1-resumida.csv",
    columns: [
      "Grupo", "Sub Grupo", "Cod Agregado", "Codigo", "Descricao", "Familia",
      "Sub-familia", "Pos.IPI/NCM", "CEST", "Tipo", "Seg.Un.Medi.", "Unidade",
      "Armazem Pad.", "Preco Venda", "Ponto Pedido", "Custo Stand.", "Ult. Preco",
      "Ult. Compra", "Peso Liquido", "Peso Bruto", "Qtd.Embalag.",
      "Lote Econom.", "Lote Minimo", "Cod Barras", "Entra MRP", "Forn. Padrao",
      "Fabricante", "Grupo Trib.", "Produto Pai", "Comprador", "Situacao",
    ],
    requiredColumns: ["Codigo", "Descricao"],
  },
  SB5: {
    folder: "Cadastros/SB5_REDUZIDAS",
    fileName: "SB5-resumida.csv",
    columns: [
      "Produto", "Preco Venda2", "Preco Venda3", "Preco Venda4", "Preco Venda5",
      "Preco Venda6", "Preco Venda7", "Cod.Desenho", "Comprimento", "Largura",
      "Altura", "Espessura", "Embalagem  1", "Embalagem  2", "Qtd.Embalag1",
      "Qtd.Embalag2", "Estado Fisic", "Car.Perigosa", "Zona Armaz.", "Marca",
      "Cod. Grupo", "Família Peça", "Marca Peca", "Linha Peça", "Tipo Insumo",
      "Mat Consumo?", "Peso", "Modelo",
    ],
    requiredColumns: ["Produto"],
  },
  SBZ: {
    folder: "Cadastros/SBZ_REDUZIDAS",
    fileName: "SBZ-resumida.csv",
    columns: [
      "Filial", "Codigo", "Armazem Pad.", "Ult. Compra", "Custo Stand.",
      "Ult. Preco", "Ult. Calculo", "Estoq Minimo", "Estoq Maximo", "Seguranca",
      "Qtd.Embalag.", "Entra MRP", "Tipo de C.Q.", "Marca Peça", "Linha Peça",
      "Família Peça", "Bloqueado?", "Tipo", "Class", "Entrega", "Prev Entrega",
      "Moeda C.Std", "Cons.Inicial",
    ],
    requiredColumns: ["Filial", "Codigo"],
  },

  // ─── CLASSIFICAÇÃO OPERACIONAL ──────────────────────
  SF4: {
    folder: "Cadastros/SF4_REDUZIDAS",
    fileName: "SF4-resumida.csv",
    columns: [
      "Filial", "Cod. do Tipo", "Tipo do TES", "Tp.Contabil", "Cod. Fiscal",
      "CFOP Estend", "Calcula IPI", "Cred. ICMS", "Gera Dupl.", "Atu.Estoque",
      "Atu.Pr.Compr", "Calcula ICMS", "Poder Terc.", "Mov. Projet.",
      "Mat.Consumo", "Agrega Valor", "Bloqueado", "Tipo Operac.",
      "Trans filial", "Op.Movimento", "Finalidade", "Mov.Fisica", "Trf Mat",
      "Trf.transito", "Custo Entr?", "Entr. Futura", "Bonificação",
      "Venda Pres.", "Componente",
    ],
    requiredColumns: ["Filial", "Cod. do Tipo", "Tipo do TES"],
  },
};

/** Retorna true se o produto tem schema configurado (columns não vazio). */
export function isProductConfigured(product: ProductCode): boolean {
  const schema = SUMMARY_SCHEMAS[product];
  return Boolean(schema && schema.columns.length > 0 && schema.folder && schema.fileName);
}

/** Lança erro descritivo se o produto não estiver configurado. */
export function assertProductConfigured(product: ProductCode): ProductSchema {
  const schema = SUMMARY_SCHEMAS[product];
  if (!schema) {
    throw new Error(`Produto desconhecido: ${product}.`);
  }
  if (!isProductConfigured(product)) {
    throw new Error(
      `Schema do produto ${product} não configurado. ` +
        `Preencha folder, fileName, columns e requiredColumns em onedriveSummarySchemas.ts antes de usar.`,
    );
  }
  return schema;
}
