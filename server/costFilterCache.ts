// Cache em memória das listas de filtro de Evolução de Custos
// (períodos, filiais, agregados e agregados com descrição).
//
// Regras de negócio (padrão do projeto — comentadas no fonte):
// - Essas listas só mudam quando entra base nova (importação de custos);
//   não faz sentido varrer cost_records (104 MB na Produção) a cada foco
//   da janela — a consulta de agregados levava ~5 s por chamada.
// - Invalidação explícita no commit e na aprovação de importação
//   (invalidateCostFilterCache chamado pelo router).
// - TTL de 10 minutos como teto de segurança: mesmo sem invalidação
//   explícita, o cache expira e relê do banco.
// - Pequeno em memória: no máximo uma entrada por chave consultada.
type Entry<T> = { value: T; expiresAt: number };

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, Entry<unknown>>();

export async function cachedFilter<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await loader();
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

export function invalidateCostFilterCache(): void {
  cache.clear();
}
