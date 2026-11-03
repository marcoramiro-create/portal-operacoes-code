export type CostEvolutionSearchItem = {
  codigo: string;
  cod_agregado?: string | null;
  filial?: string;
  descricao?: string | null;
};

/** Guarda de escopo aplicada DEPOIS da incorporação SB9 e ANTES dos cálculos.
 * O campo da tela é Item agregado: membros legítimos não são descartados
 * apenas porque o código do produto é diferente do código do agregado.
 */
export function scopeCostEvolutionItems<T extends CostEvolutionSearchItem>(
  items: T[],
  params: { codAgregado?: string; filial?: string | null },
): T[] {
  const aggregate = params.codAgregado?.trim();
  const branch = params.filial?.trim();
  if (!aggregate && !branch) return items;
  return items.filter(item => {
    const itemAggregate = String(item.cod_agregado ?? "").trim() || String(item.codigo ?? "").trim();
    return (!aggregate || itemAggregate === aggregate) &&
      (!branch || String(item.filial ?? "").trim() === branch);
  });
}

export function typedAggregateSearch(search?: string): string | null {
  const term = search?.trim() || "";
  return /^\d+(?:[-_][\p{L}\p{N}]+)?$/u.test(term) ? term : null;
}

/** Código numérico digitado isoladamente significa agregado exato.
 * Texto livre mantém busca multi-termo, incluindo dimensões como "pneu 600".
 * Não remove zeros nem sufixos, não oculta item com descrição ausente.
 */
export function filterCostEvolutionItems<T extends CostEvolutionSearchItem>(
  items: T[],
  search?: string,
  searchType?: string,
): T[] {
  const term = (search ?? "").trim();
  if (!term) return items;
  if (typedAggregateSearch(term)) {
    return scopeCostEvolutionItems(items, { codAgregado: term });
  }
  const lowerTerm = term.toLowerCase();
  const type = searchType ?? "contem";
  return items.filter(item => {
    const description = String(item.descricao ?? "").toLowerCase();
    if (type === "inicia") return description.startsWith(lowerTerm);
    if (type === "termina") return description.endsWith(lowerTerm);
    const aggregate = String(item.cod_agregado ?? "").toLowerCase();
    return lowerTerm.split(/\s+/).filter(Boolean).every(word => description.includes(word) || aggregate.includes(word));
  });
}
