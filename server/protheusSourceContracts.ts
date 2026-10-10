import { normalizeProtheusCsv, type NormalizedCsv } from "./protheusCsvNormalizer";

export type ProtheusSource = "SB1" | "SBZ" | "SA2" | "SA5" | "SC7";
export type SourceContractResult = {
  source: ProtheusSource;
  valid: boolean;
  normalized: NormalizedCsv;
  canonicalHeaders: string[];
  missing: string[];
  warnings: string[];
};

type Contract = { required: string[]; aliases: Record<string, string[]> };

const contracts: Record<ProtheusSource, Contract> = {
  SB1: {
    required: ["CODIGO_PRODUTO", "DESCRICAO"],
    aliases: { CODIGO_PRODUTO: ["CODIGO", "B1_COD", "PRODUTO", "COD_PRODUTO"], DESCRICAO: ["B1_DESC", "DESCRICAO_PRODUTO", "NOME"] },
  },
  SBZ: {
    required: ["CODIGO_PRODUTO", "FILIAL"],
    aliases: { CODIGO_PRODUTO: ["CODIGO", "BZ_COD", "PRODUTO"], FILIAL: ["BZ_FILIAL", "CODIGO_FILIAL", "BRANCH"] },
  },
  SA2: {
    required: ["CODIGO_FORNECEDOR", "LOJA", "NOME_FORNECEDOR"],
    aliases: { CODIGO_FORNECEDOR: ["CODIGO", "A2_COD", "FORNECEDOR"], LOJA: ["A2_LOJA", "STORE"], NOME_FORNECEDOR: ["A2_NOME", "NOME", "RAZAO_SOCIAL"] },
  },
  SA5: {
    required: ["CODIGO_FORNECEDOR", "LOJA", "CODIGO_PRODUTO_FORNECEDOR"],
    aliases: { CODIGO_FORNECEDOR: ["CODIGO", "A5_FORNECE", "FORNECEDOR"], LOJA: ["A5_LOJA", "STORE"], CODIGO_PRODUTO_FORNECEDOR: ["A5_PRODUT", "CODIGO_PRODUTO", "PRODUTO_FORNECEDOR"] },
  },
  SC7: {
    required: ["NUMERO_PEDIDO", "CODIGO_PRODUTO", "FILIAL", "QUANTIDADE"],
    aliases: { NUMERO_PEDIDO: ["C7_NUM", "PEDIDO", "NUM_PEDIDO"], CODIGO_PRODUTO: ["C7_PRODUTO", "CODIGO", "PRODUTO"], FILIAL: ["C7_FILIAL", "CODIGO_FILIAL", "BRANCH"], QUANTIDADE: ["C7_QUANT", "QTD", "QUANT"] },
  },
};

function canonicalize(headers: string[], contract: Contract): { canonical: string[]; missing: string[] } {
  const available = new Set(headers);
  const canonical: string[] = [];
  const missing: string[] = [];
  for (const required of contract.required) {
    const candidates = [required, ...(contract.aliases[required] ?? [])];
    const found = candidates.find(candidate => available.has(candidate));
    if (found) canonical.push(required);
    else missing.push(required);
  }
  return { canonical, missing };
}

export function validateProtheusSource(source: ProtheusSource, content: string, expectedHeaderRow = 3): SourceContractResult {
  const normalized = normalizeProtheusCsv(content, expectedHeaderRow);
  const contract = contracts[source];
  const { canonical, missing } = canonicalize(normalized.headers, contract);
  const warnings = normalized.issues.map(issue => issue.message);
  if (normalized.rows.length === 0) warnings.push("A fonte não possui registros de dados.");
  return { source, valid: missing.length === 0 && normalized.rows.length > 0 && normalized.issues.every(issue => issue.code !== "DUPLICATE_HEADER"), normalized, canonicalHeaders: canonical, missing, warnings };
}
