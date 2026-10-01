/**
 * industryCurveCalculations.ts
 * Curva ABC da Indústria (filial 0105) — 80/15/05 por agregado.
 * Módulo: server (API tRPC) — cálculo puro, sem acesso a banco.
 * Data: 01/10/2026 — REVISÃO v2: consumo em R$ PURO (regra do usuário).
 *
 * REGRAS DE NEGÓCIO (validadas com dados reais — 30/09 e 01/10/2026):
 *  1. UNIVERSO = SOMENTE os agregados do arquivo ENTRADA_NF (2.280 validados).
 *     A SB1/SBZ NUNCA criam agregado novo; servem só para descrição e para
 *     validar vínculo de produto com saldo SEM entrada (regras 5.1/7).
 *  2. Entradas em R$ = itemValue (PREÇO UNITÁRIO — confirmado em 01/10:
 *     constante por linha) x quantity, somadas por produto@mês.
 *  3. Saldo em R$ = totalValue do FECHAMENTO (VALOR TOTAL da linha —
 *     confirmado em 01/10: o mesmo produto@mês tem múltiplas linhas de
 *     quebra com o MESMO preço unitário => SOMA quantity e totalValue),
 *     somado por produto@mês.
 *  4. Consumo R$(mês) = saldoR$(mês anterior) + entradasR$(mês) - saldoR$(mês).
 *     Consumo negativo no mês -> 0 + divergência sinalizada. Soma nos 12
 *     meses da janela (primeiro mês usa saldo do mês imediatamente anterior).
 *  5. Janela = últimos 12 meses terminando no mês de referência (= último mês
 *     com FECHAMENTO em uso). Referência 2026-08, janela 2025-09 a 2026-08.
 *  6. Ranking por agregado: participação = consumo R$ do agregado / soma R$
 *     da janela; A (acumulado <= 80%), B (<= 95%), C (resto); consumo 0 -> C.
 *  7. Classe do agregado replicada para cada produto SBZ 0105 do agregado.
 *  8. Produto com saldo/entrada mas SEM agregado no universo = ÓRFÃO:
 *     não entra na curva nem no ranking; é contado e amostrado no resumo
 *     (validação entrada x SB1/SBZ).
 *  9. Normalização SEMPRE normalizeProductCode/normalizeBranchCode.
 * 10. Unidade: dominante do FECHAMENTO por produto; misturas sinalizadas.
 * 11. calculation_version = 'v2' (a v1 fica como histórico no banco).
 */
import { normalizeBranchCode, normalizeProductCode } from "./operationalNormalization";

export const INDUSTRIA_BRANCH = "0105";
export const INDUSTRIA_OPERATION = "INDUSTRIA";
export const CURVA_ABC_INDUSTRIA_SOURCE = "CURVA_ABC_INDUSTRIA";
export const CURVA_ABC_INDUSTRIA_VERSION = "v2";
export const ABC_LIMIAR_A = 0.8;
export const ABC_LIMIAR_B = 0.95;

export type IndustryCurveClass = "A" | "B" | "C";

export interface IndustryEntryRow {
  productCode: string;
  aggregateProductCode: string | null;
  entryDate: string | null; // ISO yyyy-mm-dd
  quantity: number | null;
  itemValue: number | null; // PREÇO UNITÁRIO
}
export interface IndustryStockRow {
  productCode: string;
  year: number | null;
  month: number | null;
  quantity: number | null;
  unit: string | null;
  totalValue: number | null; // VALOR TOTAL da linha (soma entre quebras)
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
  divergenciasConsumoNegativo: number;
  produtosConsumoForaUniverso: number; // órfãos
  amostraForaUniverso: string[];
  achados: IndustryCurveFinding[];
}
export interface IndustryCurveResult {
  referencePeriod: string;
  calculoVersion: string;
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
  // 1) Vínculo produto -> agregado A PARTIR DO ARQUIVO ENTRADA_NF (fonte
  // primária; confirmado: 13.859 linhas, 2.280 agregados, 0 sem agregado).
  const agregadoPorProduto = new Map<string, string>();
  for (const e of input.entradas) {
    const prod = normalizeProductCode(e.productCode);
    if (!prod) continue;
    const agg = normalizeProductCode(e.aggregateProductCode) || prod;
    if (!agregadoPorProduto.has(prod)) agregadoPorProduto.set(prod, agg);
  }
  const universo = new Set(agregadoPorProduto.values());
  const primeiroProdutoDoAgregado = new Map<string, string>();
  for (const [prod, agg] of agregadoPorProduto) {
    if (!primeiroProdutoDoAgregado.has(agg)) primeiroProdutoDoAgregado.set(agg, prod);
  }

  // SB1 (cadastro em uso): DESCRIÇÃO e fallback de VÍNCULO — nunca cria agregado.
  const sb1PorProduto = new Map<string, { aggregate: string | null; descricao: string }>();
  const sb1AggPorProduto = new Map<string, string>();
  for (const r of input.sb1) {
    const prod = normalizeProductCode(r.productCode);
    if (!prod) continue;
    const atual = sb1PorProduto.get(prod) ?? { aggregate: null, descricao: "" };
    if (r.aggregateProductCode) {
      const agg = normalizeProductCode(r.aggregateProductCode);
      atual.aggregate = agg;
      if (agg && !sb1AggPorProduto.has(prod)) sb1AggPorProduto.set(prod, agg);
    }
    if (r.description && !atual.descricao) atual.descricao = r.description;
    sb1PorProduto.set(prod, atual);
  }

  const produtosSbz0105 = new Set<string>();
  for (const r of input.sbz) {
    if (normalizeBranchCode(r.branchCode) !== INDUSTRIA_BRANCH) continue;
    const prod = normalizeProductCode(r.productCode);
    if (prod) produtosSbz0105.add(prod);
  }

  // Agregado de um produto: ENTRADA_NF primeiro; senão SB1 SE pertencer ao
  // universo; senão null (órfão — fora da curva).
  const agregadoDe = (prod: string): string | null => {
    const direto = agregadoPorProduto.get(prod);
    if (direto) return direto;
    const viaSb1 = sb1AggPorProduto.get(prod);
    if (viaSb1 && universo.has(viaSb1)) return viaSb1;
    return null;
  };

  // 2) Saldo em R$ por produto@mês — SOMA (quebras do FECHAMENTO).
  const saldoPorMes = new Map<string, { qty: number; valor: number; unit: string | null }>();
  for (const f of input.fechamentos) {
    const prod = normalizeProductCode(f.productCode);
    if (!prod || f.year == null || f.month == null) continue;
    const chave = `${prod}@${mesChave(f.year, f.month)}`;
    const atual = saldoPorMes.get(chave) ?? { qty: 0, valor: 0, unit: null };
    atual.qty += numero(f.quantity);
    atual.valor += numero(f.totalValue);
    if (f.unit && String(f.unit).trim()) atual.unit = String(f.unit).trim();
    saldoPorMes.set(chave, atual);
  }

  // 3) Entradas em R$ por produto@mês — SOMA (itemValue x quantity).
  const entradasPorMes = new Map<string, { qty: number; valor: number }>();
  for (const e of input.entradas) {
    const prod = normalizeProductCode(e.productCode);
    if (!prod || !e.entryDate) continue;
    const mes = e.entryDate.slice(0, 7);
    const cMes = entradasPorMes.get(`${prod}@${mes}`) ?? { qty: 0, valor: 0 };
    cMes.qty += numero(e.quantity);
    cMes.valor += numero(e.itemValue) * numero(e.quantity);
    entradasPorMes.set(`${prod}@${mes}`, cMes);
  }

  // 4) Mês de referência e janela de 12 meses.
  const referencia = ultimoMesFechamento(input.fechamentos);
  if (!referencia) {
    return {
      referencePeriod: "",
      calculoVersion: CURVA_ABC_INDUSTRIA_VERSION,
      registros: [],
      resumo: {
        referencePeriod: "",
        calculationVersion: CURVA_ABC_INDUSTRIA_VERSION,
        totalAgregados: universo.size,
        classeA: 0,
        classeB: 0,
        classeC: 0,
        agregadosSemConsumo: 0,
        produtosClasseA: 0,
        produtosClasseB: 0,
        produtosClasseC: 0,
        produtosGravados: 0,
        divergenciasUnidade: 0,
        divergenciasConsumoNegativo: 0,
        produtosConsumoForaUniverso: 0,
        amostraForaUniverso: [],
        achados: [],
      },
    };
  }
  const meses = mesesDaJanela(dozeMesesAtras(referencia), referencia);
  const setMeses = new Set(meses);

  // 5) Consumo R$ por produto na janela — somente dentro do universo.
  const consumoPorProduto = new Map<string, { qty: number; valor: number }>();
  const orfaos = new Set<string>();
  const produtosComDado = new Set<string>();
  for (const chave of saldoPorMes.keys()) {
    const mes = chave.split("@")[1];
    if (mes && setMeses.has(mes)) produtosComDado.add(chave.split("@")[0]);
  }
  for (const chave of entradasPorMes.keys()) produtosComDado.add(chave.split("@")[0]);

  let divergenciasConsumoNegativo = 0;
  for (const prod of produtosComDado) {
    if (!agregadoDe(prod)) {
      orfaos.add(prod);
      continue;
    }
    let totalValor = 0;
    let totalQtd = 0;
    for (const mes of meses) {
      const { ano, mes: mesNum } = anoMesDe(mes);
      const saldoPrev = saldoPorMes.get(`${prod}@${mesAnterior(ano, mesNum)`)?.valor ?? 0;
      const saldoAtual = saldoPorMes.get(`${prod}@${mes}`)?.valor ?? 0;
      const entradas = entradasPorMes.get(`${prod}@${mes}`)?.valor ?? 0;
      const consumoMes = saldoPrev + entradas - saldoAtual;
      if (consumoMes < 0) {
        divergenciasConsumoNegativo += 1;
        totalValor += 0;
      } else {
        totalValor += consumoMes;
      }
      const qtyPrev = saldoPorMes.get(`${prod}@${mesAnterior(ano, mesNum)`)?.qty ?? 0;
      const qtyAtual = saldoPorMes.get(`${prod}@${mes}`)?.qty ?? 0;
      const entradasQtd = entradasPorMes.get(`${prod}@${mes}`)?.qty ?? 0;
      const consumoQtdMes = qtyPrev + entradasQtd - qtyAtual;
      if (consumoQtdMes > 0) totalQtd += consumoQtdMes;
    }
    consumoPorProduto.set(prod, { qty: totalQtd, valor: totalValor });
  }

  // 6) Agregados: consumo R$, quantidade consumida, descrição.
  const agregadoConsumo = new Map<string, { qty: number; valor: number }>();
  for (const [prod, cons] of consumoPorProduto) {
    const agg = agregadoDe(prod);
    if (!agg) continue;
    const atual = agregadoConsumo.get(agg) ?? { qty: 0, valor: 0 };
    atual.qty += cons.qty;
    atual.valor += cons.valor;
    agregadoConsumo.set(agg, atual);
  }
  for (const agg of universo) {
    if (!agregadoConsumo.has(agg)) {
      agregadoConsumo.set(agg, { qty: 0, valor: 0 });
    }
  }
  const descricaoDe = (agg: string): string =>
    sb1PorProduto.get(agg)?.descricao ||
    (primeiroProdutoDoAgregado.has(agg)
      ? sb1PorProduto.get(primeiroProdutoDoAgregado.get(agg)!)?.descricao
      : "") ||
    agg;

  // 7) Ranking ABC por agregado (80/15/05).
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

  // 8) Unidades (dominante do FECHAMENTO por produto) + divergências.
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
    if (agg) {
      if (!unidadesDoAgregado.has(agg)) unidadesDoAgregado.set(agg, new Set());
      unidadesDoAgregado.get(agg)!.add(unit);
    }
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

  // 9) Registros: classe do agregado replicada para cada produto SBZ 0105.
  const registros: IndustryCurveRegister[] = [];
  const agregadosComSbz = new Set<string>();
  const contProduto: Record<IndustryCurveClass, number> = { A: 0, B: 0, C: 0 };
  let divergenciasUnidadeTotal = 0;
  for (const prod of produtosSbz0105) {
    const agg = agregadoDe(prod);
    if (!agg || !agregadoConsumo.has(agg)) continue; // fora do universo
    agregadosComSbz.add(agg);
    const classe = classeDoAgregado.get(agg) ?? "C";
    contProduto[classe] += 1;
    const consumo = agregadoConsumo.get(agg) ?? { qty: 0, valor: 0 };
    const unidadeDivergente =
      (unidadesDistintasPorProduto.get(prod)?.size ?? 0) > 1 ||
      (unidadesDoAgregado.get(agg)?.size ?? 0) > 1;
    if (unidadeDivergente) divergenciasUnidadeTotal += 1;
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

  // 10) Achados: agregados do universo sem produto SBZ 0105.
  const achados: IndustryCurveFinding[] = [];
  for (const agg of universo) {
    if (!agregadosComSbz.has(agg)) {
      achados.push({
        aggregateProductCode: agg,
        motivo: "Agregado do ENTRADA_NF (universo) sem produto SBZ 0105 no cadastro em uso.",
      });
    }
  }

  // 11) Resumo.
  let contA = 0;
  let contB = 0;
  let contC = 0;
  let semConsumo = 0;
  for (const [, a] of agregadoConsumo) {
    if (a.valor > 0) {
      const classe = classeDoAgregado.get(Array.from(agregadoConsumo.keys()).find((k) => agregadoConsumo.get(k) === a)!) ?? "C";
      if (classe === "A") contA += 1;
      else if (classe === "B") contB += 1;
      else contC += 1;
    } else {
      semConsumo += 1;
    }
  }

  return {
    referencePeriod: referencia,
    calculoVersion: CURVA_ABC_INDUSTRIA_VERSION,
    registros,
    resumo: {
      referencePeriod: referencia,
      calculationVersion: CURVA_ABC_INDUSTRIA_VERSION,
      totalAgregados: universo.size,
      classeA: contA,
      classeB: contB,
      classeC: contC,
      agregadosSemConsumo: semConsumo,
      produtosClasseA: contProduto.A,
      produtosClasseB: contProduto.B,
      produtosClasseC: contProduto.C,
      produtosGravados: registros.length,
      divergenciasUnidade: divergenciasUnidadeTotal,
      divergenciasConsumoNegativo,
      produtosConsumoForaUniverso: orfaos.size,
      amostraForaUniverso: Array.from(orfaos).slice(0, 20),
      achados,
    },
  };
}