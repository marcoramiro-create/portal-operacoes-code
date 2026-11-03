export type CostEvolutionSearchItem = {
  codigo: string;
  cod_agregado?: string | null;
  descricao?: string | null;
};

/**
 * Pesquisa orientada a código: para um identificador exato, prioriza o código
 * do produto. Se não houver produto com esse código, tenta o agregado exato.
 * Códigos não são normalizados removendo zeros ou sufixos.
 */
export function filterCostEvolutionItems<T extends CostEvolutionSearchItem>(
  items: T[],
  search?: string,
  searchType?: string,
): T[] {
  const term = (search ?? "").trim();
  if (!term) return items;

  const lowerTerm = term.toLocaleLowerCase("pt-BR");
  const looksLikeIdentifier = /^[\p{L}\p{N}][\p{L}\p{N}._/-]*$/u.test(term);
  if (looksLikeIdentifier) {
    const exactProducts = items.filter(item => String(item.codigo ?? "").trim().toLocaleLowerCase("pt-BR") === lowerTerm);
    if (exactProducts.length) return exactProducts;

    const exactAggregates = items.filter(item => String(item.cod_agregado ?? "").trim().toLocaleLowerCase("pt-BR") === lowerTerm);
    if (exactAggregates.length) return exactAggregates;

    // Não degrade uma busca aparentemente codificada em contains/prefixo:
    // 00899 não deve casar com 100899 nem 00899-MGT.
    if (/\p{N}/u.test(term)) return [];
  }

  const type = searchType ?? "contem";
  return items.filter(item => {
    const description = String(item.descricao ?? "").trim().toLocaleLowerCase("pt-BR");
    if (!description) return false;
    if (type === "inicia") return description.startsWith(lowerTerm);
    if (type === "termina") return description.endsWith(lowerTerm);
    const terms = lowerTerm.split(/\s+/).filter(Boolean);
    return terms.every(word => description.includes(word));
  });
}
