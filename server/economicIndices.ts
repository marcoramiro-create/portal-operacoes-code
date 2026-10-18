// ============================================================
// economicIndices.ts
// Índices econômicos oficiais: IPCA (IBGE/SIDRA, tabela 7060,
// variação mensal %) e dólar PTAX (BCB, média mensal de fechamento).
// O servidor busca APENAS os meses faltantes na API oficial, grava
// o snapshot em economic_indices (cache) e NUNCA derruba a análise
// se a API estiver indisponível — usa o último valor gravado.
// ============================================================
import { getSupabasePool } from "./supabasePortal";

export type IndiceEconomico = "IPCA" | "DOLAR";
export type IndiceStatus = "ok" | "indisponivel";

const TIMEOUT_MS = 10_000;
const INDICE_IPCA = "IPCA";
const INDICE_DOLAR = "DOLAR";
type LinhaIndice = { period: string; valor: number; valorFechamento: number | null };

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function intervaloDosPeriodos(periods: string[]): { inicio: string; fim: string } | null {
  if (!periods.length) return null;
  const sorted = [...periods].sort();
  return { inicio: sorted[0], fim: sorted[sorted.length - 1] };
}

// IPCA — IBGE/SIDRA: tabela 7060, variável 63 (variação % mensal), Brasil (N1[1]).
async function buscarIpca(inicio: string, fim: string): Promise<LinhaIndice[]> {
  const url = `https://servicodados.ibge.gov.br/api/v3/agregados/7060/periodos/${inicio}-${fim}/variaveis/63?localidades=N1[1]`;
  const payload = await fetchJson(url) as any;
  const linhas: LinhaIndice[] = [];
  for (const agregado of Array.isArray(payload) ? payload : []) {
    for (const resultado of agregado?.resultados ?? []) {
      for (const serie of resultado?.series ?? []) {
        for (const [period, valor] of Object.entries(serie?.serie ?? {})) {
          const numerico = Number(valor);
          if (/^\d{6}$/.test(period) && Number.isFinite(numerico)) linhas.push({ period, valor: numerico, valorFechamento: null });
        }
      }
    }
  }
  return linhas;
}

// Dólar — Banco Central PTAX: média mensal das cotações de FECHAMENTO (valor)
// e cotação de fechamento do último dia do mês (valorFechamento).
async function buscarDolar(inicio: string, fim: string): Promise<LinhaIndice[]> {
  const diaFinal = new Date(Number(fim.slice(0, 4)), Number(fim.slice(4, 6)), 0).getDate();
  const dataInicial = `${inicio.slice(4, 6)}-01-${inicio.slice(0, 4)}`;
  const dataFinal = `${fim.slice(4, 6)}-${String(diaFinal).padStart(2, "0")}-${fim.slice(0, 4)}`;
  const base = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)";
  const diarias: { dataHoraCotacao: string; cotacaoVenda: number }[] = [];
  let skip = 0;
  for (;;) {
    const url = `${base}?@dataInicial='${dataInicial}'&@dataFinalCotacao='${dataFinal}'&$format=json&$skip=${skip}&$top=100`;
    const payload = await fetchJson(url) as any;
    const value = Array.isArray(payload?.value) ? payload.value : [];
    for (const row of value) {
      if (row?.tipoBoletim !== "Fechamento") continue;
      const numerico = Number(row.cotacaoVenda);
      const data = String(row.dataHoraCotacao ?? "");
      if (Number.isFinite(numerico) && /^\d{4}-\d{2}-\d{2}/.test(data)) diarias.push({ dataHoraCotacao: data, cotacaoVenda: numerico });
    }
    if (value.length < 100 || skip > 10_000) break;
    skip += 100;
  }
  const porMes = new Map<string, { soma: number; dias: number; ultimaData: string; ultimoValor: number }>();
  for (const row of diarias) {
    const period = `${row.dataHoraCotacao.slice(0, 4)}${row.dataHoraCotacao.slice(5, 7)}`;
    const atual = porMes.get(period) ?? { soma: 0, dias: 0, ultimaData: "", ultimoValor: 0 };
    atual.soma += row.cotacaoVenda;
    atual.dias += 1;
    if (row.dataHoraCotacao > atual.ultimaData) { atual.ultimaData = row.dataHoraCotacao; atual.ultimoValor = row.cotacaoVenda; }
    porMes.set(period, atual);
  }
  const linhas: LinhaIndice[] = [];
  for (const [period, mes] of porMes) if (mes.dias > 0) linhas.push({ period, valor: mes.soma / mes.dias, valorFechamento: mes.ultimoValor });
  return linhas;
}

export async function garantirIndicesEconomicos(
  portalPool: ReturnType<typeof getSupabasePool>,
  periods: string[],
): Promise<Record<IndiceEconomico, IndiceStatus>> {
  const status: Record<IndiceEconomico, IndiceStatus> = { IPCA: "ok", DOLAR: "ok" };
  const intervalo = intervaloDosPeriodos(periods);
  if (!intervalo) return status;
  try {
    const { rows } = await portalPool.query<{ indice: string; period: string }>(
      `select indice, period from public.economic_indices where period between $1 and $2`,
      [intervalo.inicio, intervalo.fim],
    );
    const existentes = new Set(rows.map(row => `${row.indice}|${row.period}`));
    const fontes: Array<[IndiceEconomico, (inicio: string, fim: string) => Promise<LinhaIndice[]>]> = [
      [INDICE_IPCA, buscarIpca],
      [INDICE_DOLAR, buscarDolar],
    ];
    for (const [indice, buscar] of fontes) {
      const faltantes = periods.filter(period => !existentes.has(`${indice}|${period}`));
      if (!faltantes.length) continue;
      try {
        const linhas = await buscar(intervalo.inicio, intervalo.fim);
        for (const linha of linhas) {
          if (!periods.includes(linha.period) || existentes.has(`${indice}|${linha.period}`)) continue;
          await portalPool.query(
            `insert into public.economic_indices (indice, period, valor, valor_fechamento) values ($1, $2, $3, $4)
             on conflict (indice, period) do nothing`,
            [indice, linha.period, linha.valor, linha.valorFechamento],
          );
        }
      } catch {
        status[indice] = "indisponivel";
      }
    }
  } catch {
    status.IPCA = "indisponivel";
    status.DOLAR = "indisponivel";
  }
  return status;
}

export async function getIndicesEconomicos(
  portalPool: ReturnType<typeof getSupabasePool>,
  periods: string[],
): Promise<Record<IndiceEconomico, Map<string, { valor: number; valorFechamento: number | null }>>> {
  const mapas: Record<IndiceEconomico, Map<string, { valor: number; valorFechamento: number | null }>> = { IPCA: new Map(), DOLAR: new Map() };
  if (!periods.length) return mapas;
  const intervalo = intervaloDosPeriodos(periods)!;
  const { rows } = await portalPool.query<{ indice: string; period: string; valor: string; valorFechamento: string | null }>(
    `select indice, period, valor, valor_fechamento as "valorFechamento"
       from public.economic_indices where period between $1 and $2`,
    [intervalo.inicio, intervalo.fim],
  );
  for (const row of rows) {
    const alvo = row.indice === INDICE_DOLAR ? mapas.DOLAR : row.indice === INDICE_IPCA ? mapas.IPCA : null;
    if (!alvo) continue;
    alvo.set(row.period, { valor: Number(row.valor), valorFechamento: row.valorFechamento == null ? null : Number(row.valorFechamento) });
  }
  return mapas;
}