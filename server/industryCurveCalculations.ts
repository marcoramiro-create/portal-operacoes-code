/**
 * industryCurveCalculations.ts
 * Curva ABC da Indústria (filial 0105) — 80/15/05 por agregado.
 * Módulo: server (API tRPC) — cálculo puro, sem acesso a banco.
 * Data: 01/10/2026.
 *
 * REGRAS DE NEGÓCIO (validadas com dados reais em 30/09/2026):
 *  1. Consumo mensal por produto = saldo inicial + entradas - saldo final
 *     (saldos do FECHAMENTO_ESTOQUE; saldo final do mês = saldo inicial do
 *     próximo; consumo negativo -> 0 e divergência sinalizada).
 *  2. Entradas = ENTRADA_NF (quantity; valor = itemValue; totalValue é null
 *     no arquivo real -> NÃO usar). Mês sai do entryDate.
 *  3. Janela móvel = últimos 12 meses terminando no mês de referência
 *     (mês de referência = último mês com saldo no FECHAMENTO em uso).
 *  4. Valor do consumo = consumo_qtd x custo unitário médio do item na janela
 *     (soma itemValueqty / soma qty da ENTRADA_NF na janela).
 *  5. Ranking por agregado: participação = consumo do agregado / consumo total
 *     da janela; A (acumulado <= 80%), B (<= 95%), C (resto);
 *     valor/consumo 0 -> C. Indústria usa A/B/C.
 *  6. Universo = agregados do arquivo ENTRADA_NF (2.280 validados). Agregados
 *     sem consumo/entrada na janela -> classe C, participação 0.
 *  7. Classe do agregado replicada para cada produto SBZ 0105 do agregado.
 *     Descrição do agregado vem da SB1 (produto-chefe).
 *  8. Normalização SEMPRE com normalizeProductCode/normalizeBranchCode
 *     (preservam zeros). NUNCA normalizeCode (remove zeros — regra 10).
 *  9. Unidade (decisão 01/10/2026): SB1 primeiro (hoje não tem unidade) ->
 *     senão unidade dominante do FECHAMENTO (unit). Unidades misturadas são
 *     SINALIZADAS (unidadeDivergente), nunca bloqueiam a gravação.
 */
import { normalizeBranchCode, normalizeProductCode } from "./operationalNormalization";

export const INDUSTRIA_BRANCH = "0105";
export const INDUSTRIA_OPERATION = "INDUSTRIA";
export const CURVA_ABC_INDUSTRIA_SOURCE = "CURVA_ABC_INDUSTRIA";
export const CURVA_ABC_INDUSTRIA_VERSION = "v1";
export const ABC_LIMIAR_A = 0.8;
export const ABC_LIMIAR_B = 0.95;

export type IndustryCurveClass = "A" | "B" | "C";

export interface IndustryEntryRow {
  productCode: string;
  aggregateProductCode: string | null;
  entryDate: string | null; // ISO yyyy-mm-dd
  quantity: number | null;
  itemValue: number | null;
}
export interface IndustryStockRow {
  productCode: string;
  year: number | null;
  month: number | null;
  quantity: number | null;
  unit: string | null;
}
export interface IndustrySb1Row {
  productCode: string;
  aggregateProductCode: string | null;
  description: string;
}
export interface IndustrySbzRow {
  productCode: string;
  branchCode: string;
}
export interface IndustryCurveInput {
  entradas: IndustryEntryRow[];
  fechamentos: IndustryStockRow[];
  sb1: IndustrySb1Row[];
  sbz: IndustrySbzRow[];
}
export interface IndustryCurveRegister {
  productCode: string;
  aggregateProductCode: string;
  aggregateDescription: string;
  classe: IndustryCurveClass;
  participacao: number;
  valorConsumo: number;
  quantidadeConsumo: number;
  unidade: string | null;
  unidadeDivergente: boolean;
}
export interface IndustryCurveFinding {
  aggregateProductCode: string;
  motivo: string;
}
export interface IndustryCurveSummary {
  referencePeriod: string;
  calculationVersion: string;
  totalAgregados: number;
  classeA: number;
  classeB: number;
  classeC: number;
  agregadosSemConsumo: number;
  produtosClasseA: number;
  produtosClasseB: number;
  produtosClasseC: number;
  produtosGravados: number;
  divergenciasUnidade: number;
  achados: IndustryCurveFinding[];
}
export interface IndustryCurveResult {
  referencePeriod: string;
  registros: IndustryCurveRegister[];
  resumo: IndustryCurveSummary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function numero(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function arredondar(valor: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * f) / f;
}
function mesChave(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}
function anoMesDe(chave: string): { ano: number; mes: number } {
  const partes = chave.split("-");
  return { ano: Number(partes[0]), mes: Number(partes[1]) };
}
function mesAnterior(ano: number, mes: number): string {
  return mes === 1 ? mesChave(ano - 1, 12) : mesChave(ano, mes - 1);
}
/** Primeiro mês dos últimos 12 meses terminando em `fim` (11 meses antes). */
function dozeMesesAtras(fim: string): string {
  const { ano, mes } = anoMesDe(fim);
  let a = ano;
  let m = mes;
  for (let i = 0; i < 11; i += 1) {
    if (m === 1) {
      a -= 1;
      m = 12;
    } else {
      m -= 1;
    }
  }
  return mesChave(a, m);
}
function mesesDaJanela(inicio: string, fim: string): string[] {
  const meses: string[] = [];
  let { ano, mes } = anoMesDe(inicio);
  const { ano: anoF, mes: mesF } = anoMesDe(fim);
  let guard = 0;
  while (guard < 400) {
    guard += 1;
    meses.push(mesChave(ano, mes));
    if (ano === anoF && mes === mesF) break;
    if (mes === 12) {
      ano += 1;
      mes = 1;
    } else {
      mes += 1;
    }
  }
  return meses;
}
function ultimoMesFechamento(fechamentos: IndustryStockRow[]): string | null {
  let melhor: string | null = null;
  for (const f of fechamentos) {
    if (f.year == null || f.month == null) continue;
    const chave = mesChave(f.year, f.month);
    if (!melhor || chave > melhor) melhor = chave;
  }
  return melhor;
}

// ---------------------------------------------------------------------------
// Função principal (pura)
// ---------------------------------------------------------------------------
export function calcularCurvaIndustriaCore(input: IndustryCurveInput): IndustryCurveResult {
  // 1) Índices auxiliares
  const sb1PorProduto = new Map<string, { aggregate: string | null; descricao: string }>();
  for (const r of input.sb1) {
    const prod = normalizeProductCode(r.productCode);
    if (!prod) continue;
    const atual = sb1PorProduto.get(prod) ?? { aggregate: null, descricao: "" };
    if (r.aggregateProductCode) atual.aggregate = normalizeProductCode(r.aggregateProductCode);
    if (r.description && !atual.descricao) atual.descricao = r.description;
    sb1PorProduto.set(prod, atual);
  }
  const produtosSbz0105 = new Set<string>();
  for (const r of input.sbz) {
    if (normalizeBranchCode(r.branchCode) !== INDUSTRIA_BRANCH) continue;
    const prod = normalizeProductCode(r.productCode);
    if (prod) produtosSbz0105.add(prod);
  }

  // Saldo por produto@mês (FECHAMENTO) — última linha do mês prevalece.
  const saldoPorMes = new Map<string, { qty: number; unit: string | null }>();
  for (const f of input.fechamentos) {
    const prod = normalizeProductCode(f.productCode);
    if (!prod || f.year == null || f.month == null) continue;
    const chave = `${prod}@${mesChave(f.year, f.month)}`;
    const atual = saldoPorMes.get(chave) ?? { qty: 0, unit: null };
    atual.qty = numero(f.quantity);
    if (f.unit && String(f.unit).trim()) atual.unit = String(f.unit).trim();
    saldoPorMes.set(chave, atual);
  }

  // Mês de referência = último mês do FECHAMENTO em uso.
  const referencia = ultimoMesFechamento(input.fechamentos);
  if (!referencia) {
    return {
      referencePeriod: "",
      registros: [],
      resumo: {
        referencePeriod: "",
        calculationVersion: CURVA_ABC_INDUSTRIA_VERSION,
        totalAgregados: 0,
        classeA: 0,
        classeB: 0,
        classeC: 0,
        agregadosSemConsumo: 0,
        produtosClasseA: 0,
        produtosClasseB: 0,
        produtosClasseC: 0,
        produtosGravados: 0,
        divergenciasUnidade: 0,
        achados: [],
      },
    };
  }
  const meses = mesesDaJanela(dozeMesesAtras(referencia), referencia);
  const setMeses = new Set(meses);

  // 2) Entradas na janela + custo unitário médio por item
  const entradasPorMes = new Map<string, { qty: number; valorPonderado: number }>();
  const custoGlobal = new Map<string, { qty: number; valor: number }>();
  for (const e of input.entradas) {
    const prod = normalizeProductCode(e.productCode);
    if (!prod || !e.entryDate) continue;
    const mes = e.entryDate.slice(0, 7);
    if (!setMeses.has(mes)) continue;
    const qty = numero(e.quantity);
    const valor = numero(e.itemValue) * qty;
    const cMes = entradasPorMes.get(`${prod}@${mes}`) ?? { qty: 0, valorPonderado: 0 };
    cMes.qty += qty;
    cMes.valorPonderado += valor;
    entradasPorMes.set(`${prod}@${mes}`, cMes);
    const cG = custoGlobal.get(prod) ?? { qty: 0, valor: 0 };
    cG.qty += qty;
    cG.valor += valor;
    custoGlobal.set(prod, cG);
  }

  // 3) Consumo por produto na janela
  const consumoPorProduto = new Map<string, { qty: number; divergencia: boolean }>();
  const produtosComDado = new Set<string>();
  for (const chave of saldoPorMes.keys()) {
    const prod = chave.split("@")[0];
    const mes = chave.split("@")[1];
    if (mes && setMeses.has(mes)) produtosComDado.add(prod);
  }
  for (const chave of entradasPorMes.keys()) produtosComDado.add(chave.split("@")[0]);
  for (const prod of produtosComDado) {
    let total = 0;
    let divergiu = false;
    for (const mes of meses) {
      const { ano, mes: mesNum } = anoMesDe(mes);
      const saldoInit = saldoPorMes.get(`${prod}@${mesAnterior(ano, mesNum)}`)?.qty ?? 0;
      const saldoFim = saldoPorMes.get(`${prod}@${mes}`)?.qty ?? 0;
      const entradas = entradasPorMes.get(`${prod}@${mes}`)?.qty ?? 0;
      const consumoMes = saldoInit + entradas - saldoFim;
      if (consumoMes < 0) {
        divergiu = true; // consumo negativo -> 0
      } else {
        total += consumoMes;
      }
    }
    consumoPorProduto.set(prod, { qty: total, divergencia: divergiu });
  }

  // 4) Agregados: consumo e valor, universo = ENTRADA_NF
  const agregadoDe = (prod: string): string => sb1PorProduto.get(prod)?.aggregate ?? prod;
  const agregadoConsumo = new Map<string, { qty: number; valor: number }>();
  const primeiroMembro = new Map<string, string>();
  const somaPara = (agg: string, qty: number, valor: number) => {
    const atual = agregadoConsumo.get(agg) ?? { qty: 0, valor: 0 };
    atual.qty += qty;
    atual.valor += valor;
    agregadoConsumo.set(agg, atual);
  };
  for (const [prod, cons] of consumoPorProduto) {
    const agg = agregadoDe(prod);
    if (!primeiroMembro.has(agg)) primeiroMembro.set(agg, prod);
    const cg = custoGlobal.get(prod);
    const custoMedio = cg && cg.qty > 0 ? cg.valor / cg.qty : 0;
    somaPara(agg, cons.qty, cons.qty * custoMedio);
  }
  for (const e of input.entradas) {
    const prod = normalizeProductCode(e.productCode);
    if (!prod) continue;
    const agg = normalizeProductCode(e.aggregateProductCode) || agregadoDe(prod);
    if (!agregadoConsumo.has(agg)) {
      agregadoConsumo.set(agg, { qty: 0, valor: 0 });
      primeiroMembro.set(agg, prod);
    } else if (!primeiroMembro.has(agg)) {
      primeiroMembro.set(agg, prod);
    }
  }
  const descricaoDe = (agg: string): string =>
    sb1PorProduto.get(agg)?.descricao ||
    (primeiroMembro.has(agg) ? sb1PorProduto.get(primeiroMembro.get(agg)!)?.descricao : "") ||
    agg;

  // 5) Ranking ABC por agregado
  const somaValores = Array.from(agregadoConsumo.values()).reduce((acc, a) => acc + a.valor, 0);
  const classeDoAgregado = new Map<string, IndustryCurveClass>();
  const participacaoDoAgregado = new Map<string, number>();
  const ordenados = Array.from(agregadoConsumo.entries())
    .filter(([, a]) => a.valor > 0)
    .sort((a, b) => b[1].valor - a[1].valor);
  let acumulado = 0;
  for (const [agg, a] of ordenados) {
    acumulado += a.valor;
    const perc = somaValores > 0 ? acumulado / somaValores : 1;
    const classe: IndustryCurveClass = perc <= ABC_LIMIAR_A ? "A" : perc <= ABC_LIMIAR_B ? "B" : "C";
    classeDoAgregado.set(agg, classe);
    participacaoDoAgregado.set(agg, somaValores > 0 ? a.valor / somaValores : 0);
  }
  for (const agg of agregadoConsumo.keys()) {
    if (!classeDoAgregado.has(agg)) {
      classeDoAgregado.set(agg, "C");
      participacaoDoAgregado.set(agg, 0);
    }
  }

  // 6) Unidades (FECHAMENTO): dominante por produto + divergências
  const ocorrenciasUnidade = new Map<string, Map<string, number>>();
  const unidadesDistintasPorProduto = new Map<string, Set<string>>();
  const unidadesDoAgregado = new Map<string, Set<string>>();
  for (const [chave, saldo] of saldoPorMes) {
    const prod = chave.split("@")[0];
    const mes = chave.split("@")[1];
    if (!mes || !setMeses.has(mes)) continue;
    if (!saldo.unit) continue;
    const unit = saldo.unit.toUpperCase();
    if (!ocorrenciasUnidade.has(prod)) ocorrenciasUnidade.set(prod, new Map());
    const cont = ocorrenciasUnidade.get(prod)!;
    cont.set(unit, (cont.get(unit) ?? 0) + 1);
    if (!unidadesDistintasPorProduto.has(prod)) unidadesDistintasPorProduto.set(prod, new Set());
    unidadesDistintasPorProduto.get(prod)!.add(unit);
    const agg = agregadoDe(prod);
    if (!unidadesDoAgregado.has(agg)) unidadesDoAgregado.set(agg, new Set());
    unidadesDoAgregado.get(agg)!.add(unit);
  }
  const unidadePorProduto = new Map<string, string | null>();
  for (const [prod, cont] of ocorrenciasUnidade) {
    let melhorUnit: string | null = null;
    let melhorQtd = -1;
    for (const [unit, qtd] of cont) {
      if (qtd > melhorQtd) {
        melhorQtd = qtd;
        melhorUnit = unit;
      }
    }
    unidadePorProduto.set(prod, melhorUnit);
  }

  // 7) Registros: classe do agregado replicada para cada produto SBZ 0105
  const registros: IndustryCurveRegister[] = [];
  const agregadosComSbz = new Set<string>();
  const contProduto: Record<IndustryCurveClass, number> = { A: 0, B: 0, C: 0 };
  let divergenciasUnidade = 0;
  for (const prod of produtosSbz0105) {
    const agg = agregadoDe(prod);
    if (!agregadoConsumo.has(agg)) continue; // fora do universo ENTRADA_NF
    agregadosComSbz.add(agg);
    const classe = classeDoAgregado.get(agg) ?? "C";
    contProduto[classe] += 1;
    const consumo = agregadoConsumo.get(agg) ?? { qty: 0, valor: 0 };
    const unidadeDivergente =
      (unidadesDistintasPorProduto.get(prod)?.size ?? 0) > 1 ||
      (unidadesDoAgregado.get(agg)?.size ?? 0) > 1;
    if (unidadeDivergente) divergenciasUnidade += 1;
    registros.push({
      productCode: prod,
      aggregateProductCode: agg,
      aggregateDescription: descricaoDe(agg),
      classe,
      participacao: participacaoDoAgregado.get(agg) ?? 0,
      valorConsumo: arredondar(consumo.valor, 2),
      quantidadeConsumo: arredondar(consumo.qty, 2),
      unidade: unidadePorProduto.get(prod) ?? null,
      unidadeDivergente,
    });
  }

  // 8) Achados: agregados do universo sem produto SBZ 0105 (não somem)
  const achados: IndustryCurveFinding[] = [];
  for (const agg of agregadoConsumo.keys()) {
    if (!agregadosComSbz.has(agg)) {
      achados.push({
        aggregateProductCode: agg,
        motivo: "Agregado com entrada no ENTRADA_NF sem produto SBZ 0105.",
      });
    }
  }

  // 9) Resumo (contagens por AGREGADO e por PRODUTO)
  const ranked = ordenados.length;
  let contA = 0;
  let contB = 0;
  let contC = 0;
  let semConsumo = 0;
  for (const [agg, a] of agregadoConsumo) {
    const classe = classeDoAgregado.get(agg) ?? "C";
    if (a.valor > 0) {
      if (classe === "A") contA += 1;
      else if (classe === "B") contB += 1;
      else contC += 1;
    } else {
      semConsumo += 1;
    }
  }
  void ranked;
  return {
    referencePeriod: referencia,
    registros,
    resumo: {
      referencePeriod: referencia,
      calculationVersion: CURVA_ABC_INDUSTRIA_VERSION,
      totalAgregados: agregadoConsumo.size,
      classeA: contA,
      classeB: contB,
      classeC: contC,
      agregadosSemConsumo: semConsumo,
      produtosClasseA: contProduto.A,
      produtosClasseB: contProduto.B,
      produtosClasseC: contProduto.C,
      produtosGravados: registros.length,
      divergenciasUnidade,
      achados,
    },
  };
}