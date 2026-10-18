// ============================================================
// economicIndices.ts
// IPCA (IBGE/SIDRA, tabela 7060, variação mensal %) e dólar em CASCATA.
// B-v7 (18/10/2026) — quadro das fontes PROVADO por curl na VM:
//   • PTAX Olinda (BCB): responde {"codigo":500} — serviço rejeita;
//   • SGS (api.bcb.gov.br, todos os endpoints): timeout com 0 bytes — bloqueio;
//   • AwesomeAPI: HTTP 429 QuotaExceeded — cota do IP de datacenter esgotada;
//   • Frankfurter: 301 (domínio movido; ficaria p/ teste futuro);
//   • Currency-API via CDN jsDelivr: FUNCIONA (JSON completo em <1s).
// Cascata do dólar: Olinda → SGS → Currency-API (CDN). O BCB é o 1º da fila:
// se o IP da VM for liberado, volta a ser usado automaticamente. A CDN publica
// snapshot diário de mercado (usd.brl); amostragem de 5 dias/mês (1, 8, 15, 22,
// último) → média mensal (valor) + snapshot mais próximo do fim do mês
// (valorFechamento). Meses fechados apenas — o mês corrente fica de fora até fechar.
// O servidor busca APENAS os meses faltantes, grava em economic_indices (cache),
// NUNCA derruba a análise, e cada tentativa falha vai para o detalhe do toast.
// ============================================================
import { getSupabasePool } from "./supabasePortal";

export type IndiceEconomico = "IPCA" | "DOLAR";
export type IndiceStatus = "ok" | "indisponivel";
export type StatusIndices = Record<IndiceEconomico, IndiceStatus> & { detalhes: Partial<Record<IndiceEconomico, string>> };

const TIMEOUT_MS = 20_000;
const INDICE_IPCA = "IPCA";
const INDICE_DOLAR = "DOLAR";
type LinhaIndice = { period: string; valor: number; valorFechamento: number | null };

async function fetchJson(url: string, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function mensagemErro(error: unknown): string {
  if (error instanceof Error) return error.name === "AbortError" ? "timeout" : error.message;
  return String(error);
}

function intervaloDosPeriodos(periods: string[]): { inicio: string; fim: string } | null {
  if (!periods.length) return null;
  const sorted = [...periods].sort();
  return { inicio: sorted[0], fim: sorted[sorted.length - 1] };
}

function proximoPeriodo(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));
  return month === 12 ? `${year + 1}01` : `${year}${String(month + 1).padStart(2, "0")}`;
}

function periodoCorrente(): string {
  const agora = new Date();
  return `${agora.getUTCFullYear()}${String(agora.getUTCMonth() + 1).padStart(2, "0")}`;
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

// Fonte 1 — PTAX Olinda (BCB): média mensal das cotações de FECHAMENTO (valor)
// e cotação de fechamento do último dia do mês (valorFechamento). Datas dd-MM-yyyy.
async function buscarDolarOlinda(inicio: string, fim: string): Promise<LinhaIndice[]> {
  const diaFinal = new Date(Number(fim.slice(0, 4)), Number(fim.slice(4, 6)), 0).getDate();
  const dataInicial = `01-${inicio.slice(4, 6)}-${inicio.slice(0, 4)}`;
  const dataFinal = `${String(diaFinal).padStart(2, "0")}-${fim.slice(4, 6)}-${fim.slice(0, 4)}`;
  const base = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)";
  const diarias: { dataHoraCotacao: string; cotacaoVenda: number }[] = [];
  let skip = 0;
  for (;;) {
    const url = `${base}?@dataInicial=%27${dataInicial}%27&@dataFinalCotacao=%27${dataFinal}%27&$format=json&$skip=${skip}&$top=100`;
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

// Fonte 2 — SGS série 10813 (BCB): PTAX dólar VENDA diário, datas dd/MM/yyyy,
// valores com vírgula decimal. Média mensal (valor) + último dia (valorFechamento).
async function buscarDolarSgs(inicio: string, fim: string): Promise<LinhaIndice[]> {
  const dataInicial = `01/${inicio.slice(4, 6)}/${inicio.slice(0, 4)}`;
  const diaFinal = new Date(Number(fim.slice(0, 4)), Number(fim.slice(4, 6)), 0).getDate();
  const dataFinal = `${String(diaFinal).padStart(2, "0")}/${fim.slice(4, 6)}/${fim.slice(0, 4)}`;
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.10813/dados?formato=json&dataInicial=${dataInicial}&dataFinal=${dataFinal}`;
  const payload = await fetchJson(url) as any;
  const porMes = new Map<string, { soma: number; dias: number; ultimaData: string; ultimoValor: number }>();
  for (const row of Array.isArray(payload) ? payload : []) {
    const data = String(row?.data ?? "");
    const valor = Number(String(row?.valor ?? "").replace(",", "."));
    const match = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match || !Number.isFinite(valor)) continue;
    const period = `${match[3]}${match[2]}`;
    const ordem = `${match[3]}-${match[2]}-${match[1]}`;
    const atual = porMes.get(period) ?? { soma: 0, dias: 0, ultimaData: "", ultimoValor: 0 };
    atual.soma += valor;
    atual.dias += 1;
    if (ordem > atual.ultimaData) { atual.ultimaData = ordem; atual.ultimoValor = valor; }
    porMes.set(period, atual);
  }
  const linhas: LinhaIndice[] = [];
  for (const [period, mes] of porMes) if (mes.dias > 0) linhas.push({ period, valor: mes.soma / mes.dias, valorFechamento: mes.ultimoValor });
  return linhas;
}

// Fonte 3 — Currency-API via CDN jsDelivr (PROVADA por curl na VM 18/10):
// snapshot diário em .../npm/@fawazahmed0/currency-api@YYYY-MM-DD/v1/currencies/usd.json
// com usd.brl = dólar de mercado do dia. CDN global: sem chave, sem cota por IP.
async function buscarSnapshotCdn(ano: number, mes: number, dia: number, tentativa = 0): Promise<number | null> {
  const data = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  try {
    const payload = await fetchJson(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${data}/v1/currencies/usd.json`, 8_000) as any;
    const valor = Number(payload?.usd?.brl);
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  } catch {
    // Dia sem publicação (404/erro) → tenta o dia seguinte (máx. 2 tentativas).
    if (tentativa >= 2) return null;
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const proximoDia = dia + 1;
    return proximoDia > diasNoMes ? null : buscarSnapshotCdn(ano, mes, proximoDia, tentativa + 1);
  }
}

// Um mês pela CDN: 5 snapshots em paralelo (dias 1, 8, 15, 22 e o último).
// Média da amostra = valor mensal; snapshot do último dia (ou o mais próximo
// ANTERIOR disponível, com recuo de 1-2 dias) = valorFechamento.
async function buscarMesCdn(period: string): Promise<LinhaIndice | null> {
  const ano = Number(period.slice(0, 4));
  const mes = Number(period.slice(4, 6));
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const diasAmostra = [1, 8, 15, 22, diasNoMes];
  const snapshots = await Promise.all(diasAmostra.map(dia => buscarSnapshotCdn(ano, mes, dia)));
  const valores = snapshots.filter((valor): valor is number => valor != null);
  if (!valores.length) return null;
  let fechamento: number | null = snapshots[4] ?? null;
  if (fechamento == null) {
    for (const recuo of [1, 2]) {
      const dia = diasNoMes - recuo;
      if (dia < 1) break;
      const valor = await buscarSnapshotCdn(ano, mes, dia);
      if (valor != null) { fechamento = valor; break; }
    }
  }
  return { period, valor: valores.reduce((acc, valor) => acc + valor, 0) / valores.length, valorFechamento: fechamento };
}

// Meses FECHADOS apenas — o mês corrente está em formação e não é gravado
// (on conflict do nothing congelaria uma média parcial para sempre).
async function buscarDolarCdn(inicio: string, fim: string): Promise<LinhaIndice[]> {
  const corrente = periodoCorrente();
  const periodos: string[] = [];
  for (let period = inicio; period <= fim; period = proximoPeriodo(period)) {
    if (period >= corrente) break;
    periodos.push(period);
  }
  const linhas: LinhaIndice[] = [];
  for (let i = 0; i < periodos.length; i += 8) {
    const lote = periodos.slice(i, i + 8);
    const resultados = await Promise.all(lote.map(period => buscarMesCdn(period)));
    for (const resultado of resultados) if (resultado) linhas.push(resultado);
  }
  return linhas;
}

// Cascata do dólar: tenta as fontes em ordem e registra o resultado de CADA
// tentativa — o toast conta exatamente o que aconteceu com cada uma.
async function buscarDolarComFallback(inicio: string, fim: string): Promise<{ linhas: LinhaIndice[]; fonte: string | null; tentativas: string[] }> {
  const tentativas: string[] = [];
  try {
    const linhas = await buscarDolarOlinda(inicio, fim);
    if (linhas.length) return { linhas, fonte: "PTAX Olinda (BCB)", tentativas: [...tentativas, "Olinda: ok"] };
    tentativas.push("Olinda: serviço respondeu sem dados (HTTP 500)");
  } catch (error) {
    tentativas.push(`Olinda: ${mensagemErro(error)}`);
  }
  try {
    const linhas = await buscarDolarSgs(inicio, fim);
    if (linhas.length) return { linhas, fonte: "SGS 10813 (BCB)", tentativas: [...tentativas, "SGS: ok"] };
    tentativas.push("SGS: série sem dados");
  } catch (error) {
    tentativas.push(`SGS: ${mensagemErro(error)}`);
  }
  try {
    const linhas = await buscarDolarCdn(inicio, fim);
    if (linhas.length) return { linhas, fonte: "Currency-API (CDN jsDelivr)", tentativas: [...tentativas, "CDN: ok"] };
    tentativas.push("CDN: sem dados");
  } catch (error) {
    tentativas.push(`CDN: ${mensagemErro(error)}`);
  }
  return { linhas: [], fonte: null, tentativas };
}

export async function garantirIndicesEconomicos(
  portalPool: ReturnType<typeof getSupabasePool>,
  periods: string[],
): Promise<StatusIndices> {
  const status: StatusIndices = { IPCA: "ok", DOLAR: "ok", detalhes: {} };
  const intervalo = intervaloDosPeriodos(periods);
  if (!intervalo) return status;
  try {
    const { rows } = await portalPool.query<{ indice: string; period: string }>(
      `select indice, period from public.economic_indices where period between $1 and $2`,
      [intervalo.inicio, intervalo.fim],
    );
    const existentes = new Set(rows.map(row => `${row.indice}|${row.period}`));
    // — IPCA (IBGE) —
    const faltantesIpca = periods.filter(period => !existentes.has(`${INDICE_IPCA}|${period}`));
    if (faltantesIpca.length) {
      try {
        const linhas = await buscarIpca(intervalo.inicio, intervalo.fim);
        for (const linha of linhas) {
          if (!periods.includes(linha.period) || existentes.has(`${INDICE_IPCA}|${linha.period}`)) continue;
          await portalPool.query(
            `insert into public.economic_indices (indice, period, valor, valor_fechamento) values ($1, $2, $3, $4)
             on conflict (indice, period) do nothing`,
            [INDICE_IPCA, linha.period, linha.valor, linha.valorFechamento],
          );
        }
      } catch (error) {
        status.IPCA = "indisponivel";
        status.detalhes.IPCA = mensagemErro(error);
      }
    }
    // — DÓLAR (cascata Olinda → SGS → Currency-API/CDN) —
    const faltantesDolar = periods.filter(period => !existentes.has(`${INDICE_DOLAR}|${period}`));
    if (faltantesDolar.length) {
      try {
        const { linhas, fonte, tentativas } = await buscarDolarComFallback(intervalo.inicio, intervalo.fim);
        if (linhas.length) {
          for (const linha of linhas) {
            if (!periods.includes(linha.period) || existentes.has(`${INDICE_DOLAR}|${linha.period}`)) continue;
            await portalPool.query(
              `insert into public.economic_indices (indice, period, valor, valor_fechamento) values ($1, $2, $3, $4)
               on conflict (indice, period) do nothing`,
              [INDICE_DOLAR, linha.period, linha.valor, linha.valorFechamento],
            );
          }
        } else {
          status.DOLAR = "indisponivel";
          status.detalhes.DOLAR = tentativas.join(" · ");
        }
      } catch (error) {
        status.DOLAR = "indisponivel";
        status.detalhes.DOLAR = mensagemErro(error);
      }
    }
  } catch (error) {
    status.IPCA = "indisponivel";
    status.DOLAR = "indisponivel";
    const mensagem = mensagemErro(error);
    status.detalhes.IPCA = mensagem;
    status.detalhes.DOLAR = mensagem;
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