// ============================================================
// onedriveSummarySchemas.ts — CONFIGURAÇÃO das versões resumidas
// ============================================================
// Este é o ÚNICO arquivo que muda quando um produto novo entra.
// O serviço (onedriveSummaryWriter.ts) não conhece produto específico:
// ele recebe um ProductCode e busca o schema aqui.
//
// PARA ATIVAR UM PRODUTO NOVO:
//   1. Preencha folder, fileName, columns e requiredColumns
//   2. Rode os testes — o teste "produto não configurado" vai falhar
//      para esse produto, avisando que ele agora está ativo
//   3. Nenhuma alteração no serviço é necessária
// ============================================================

export type ProductCode = "SB9" | "SB2" | "SC7" | "SD1";

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
 * SB9 está preenchido conforme o documento
 * 20261030-CLAUDE-INSTRUCOES-MANUS-PIPELINE-SB9-E-REPLICACAO.docx (seção 5).
 *
 * SB2, SC7 e SD1 estão VAZIOS de propósito: o serviço falha explicitamente
 * se forem chamados, em vez de gravar arquivo vazio ou corrompido.
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

  // ─── A PREENCHER ────────────────────────────────────────────
  // Preencha quando o Manus entregar a especificação de colunas.
  // Enquanto vazio, writeSummaryAtomic("SB2", ...) lança erro claro.
  SB2: { folder: "", fileName: "", columns: [], requiredColumns: [] },
  SC7: { folder: "", fileName: "", columns: [], requiredColumns: [] },
  SD1: { folder: "", fileName: "", columns: [], requiredColumns: [] },
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