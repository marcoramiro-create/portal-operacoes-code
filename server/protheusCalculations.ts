// ============================================================
// server/protheusCalculations.ts
// Motor de cálculos — traduz as fórmulas e a macro da Sugestão de Compras.
// ============================================================

// Filiais que devem ser DESCARTADAS na importação
export const BRANCHES_IGNORADAS = new Set(["0105", "0201"]);
// Filiais aceitas (mantidas)
export const BRANCHES_ACEITAS = new Set(["0101", "0102", "0301", "0303"]);

// Dias máximos de cobertura por classe (usado no Excedente)
export const DIAS_MAXIMOS: Record<"A" | "B" | "C", number> = { A: 60, B: 90, C: 120 };

export type RawProtheusRow = {
  code: string;
  description: string;
  branch: string;
  ultimaCompra: string;
  months: number[]; // 13 meses
  custoUn13M: number;
  custoTot13M: number;
  prazo: number;
  estoque: number;
  pedidos: number;
};

export type ReferenceData = {
  sb1: Map<string, { tipo: string; familiaCode: string; subfamiliaCode: string }>;
  sbz: Map<string, { estoqMin: number | null; estoqMax: number | null; entraMrp: string }>;
  familias: Map<string, string>;
  subfamilias: Map<string, string>;
};

export type CalculatedRow = {
  code: string;
  description: string;
  branch: string;
  productType: "ME" | "PE";
  mrp: "Sim" | "Não";
  family: string;
  subfamily: string;
  curve: "A" | "B" | "C" | "D" | "E";
  sales13M: number;
  salesValue13M: number;
  stock: number;
  stockValue: number;
  coverageDays: number;
  excessValue: number;
  turnover: number;
  mediaP13M: number;
  cd: number;
  es: number;
  em: number;
  pp: number;
  comprar: number;
  rescencia: number;
  nroMeses: number;
  frequencia: number;
  valor: number;
  total: number;
  classificacao: string;
  diasE: number;
  chave: string;
  eMin: number | null;
  eMax: number | null;
  eMenor: boolean;
  faltante: number;
  eFut: number;
  compB: number;
  critMrp: string;
  mesAno: string;
  tipo: string;
  familia: string;
  subfamilia: string;
  ultimaCompra: string;
  pctAcumTipo: number;
  classeMacro: "A" | "B" | "C";
  giroCapital: number;
  coberturaDias: number;
  excedenteR: number;
};

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").replace(/[R$\s]/g, "").trim();
  if (!text) return 0;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  const normalized = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
}

function parseDate(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 20000) {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const d = new Date(text);
  return isNaN(d.getTime()) ? null : d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// MediaP13M: (Ago*3 + Set*3 + Out..Mai*1 + Jun*3 + Jul*3) / 20
export function calculateMediaP13M(months: number[]): number {
  if (months.length < 12) return 0;
  const weights = [3, 3, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (months[i] || 0) * weights[i];
  return sum / 20;
}

export function calculatePerRow(row: RawProtheusRow, ref: ReferenceData): Omit<CalculatedRow, "pctAcumTipo" | "classeMacro"> {
  const months = row.months;
  const mediaP13M = calculateMediaP13M(months);
  const cd = mediaP13M / 30;
  const es = cd * 15;
  const em = cd * row.prazo;
  const pp = em + es;
  const comprar = row.estoque + row.pedidos < pp ? Math.ceil(cd * 20) : 0;

  const rescencia = (months[9] > 0 ? 1 : 0) + (months[10] > 0 ? 1 : 0) + (months[11] > 0 ? 1 : 0);
  const nroMeses = months.filter(m => m > 0).length;
  const frequencia = nroMeses <= 4 ? 1 : nroMeses <= 8 ? 2 : 3;
  const valor = row.custoTot13M >= 10000 ? 3 : 0;
  const total = valor + frequencia + rescencia;
  const classificacao = total >= 5 ? "IMPORTANTE" : "";
  const diasE = mediaP13M > 0 ? ((row.estoque + row.pedidos + comprar) / mediaP13M) * 30 : 0;

  const chave = row.code + row.branch;
  const sbz = ref.sbz.get(chave);
  const eMin = sbz?.estoqMin ?? null;
  const eMax = sbz?.estoqMax ?? null;
  const eMenor = eMin != null && row.estoque + row.pedidos < eMin;
  const faltante = eMax != null && eMax - (row.estoque + row.pedidos) > 0 ? eMax - (row.estoque + row.pedidos) : 0;
  const eFut = row.estoque - (cd * row.prazo) < 0 ? 0 : row.estoque - (cd * row.prazo);
  const diasAlvo = nroMeses < 12 ? 90 : 60;
  const compB = Math.max(0, Math.ceil(eFut < pp ? diasAlvo * cd - (eFut + row.pedidos) : 0));

  const stockValue = row.estoque * row.custoUn13M;
  const ultimaCompra = parseDate(row.ultimaCompra);
  const mesAno = ultimaCompra ? `${ultimaCompra.getMonth() + 1}/${ultimaCompra.getFullYear()}` : "";

  const sb1 = ref.sb1.get(row.code);
  const tipo = sb1?.tipo ?? "";
  const familia = (sb1 && ref.familias.get(sb1.familiaCode)) ?? sb1?.familiaCode ?? "";
  const subfamilia = (sb1 && ref.subfamilias.get(sb1.subfamiliaCode)) ?? sb1?.subfamiliaCode ?? "";

  const giroCapital = stockValue > 0 ? row.custoTot13M / stockValue : 0;
  const coberturaDias = row.custoTot13M > 0 ? stockValue / (row.custoTot13M / 390) : 0;
  const productType = (tipo || "").toUpperCase() === "PE" ? "PE" : "ME";
  const mrp = (sbz?.entraMrp || "").toUpperCase() === "SIM" ? "Sim" : "Não";

  return {
    code: row.code,
    description: row.description,
    branch: row.branch,
    productType,
    mrp,
    family: familia,
    subfamily: subfamilia,
    curve: "C",
    sales13M: months.reduce((s, m) => s + m, 0),
    salesValue13M: row.custoTot13M,
    stock: row.estoque,
    stockValue,
    coverageDays: coberturaDias,
    excessValue: 0,
    turnover: giroCapital,
    mediaP13M, cd, es, em, pp, comprar, rescencia, nroMeses, frequencia, valor, total, classificacao,
    diasE, chave, eMin, eMax, eMenor, faltante, eFut, compB,
    critMrp: sbz?.entraMrp ?? "Nao",
    mesAno, tipo, familia, subfamilia, ultimaCompra: row.ultimaCompra,
    giroCapital, coberturaDias, excedenteR: 0,
  };
}

// Classificação ABC da macro (por grupo Filial+Tipo) + reclassificação BI (A/B/C/D/E)
export function applyAbcClassification(rows: Omit<CalculatedRow, "pctAcumTipo" | "classeMacro">[], hoje = new Date()): CalculatedRow[] {
  const groups = new Map<string, Omit<CalculatedRow, "pctAcumTipo" | "classeMacro">[]>();
  rows.forEach(row => {
    const key = `${row.branch}::${row.tipo}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  });

  const result: CalculatedRow[] = [];
  groups.forEach(list => {
    const sorted = [...list].sort((a, b) => b.salesValue13M - a.salesValue13M);
    const total = sorted.reduce((s, r) => s + r.salesValue13M, 0);
    let acum = 0;
    sorted.forEach(row => {
      let pctAcumTipo = 0;
      let classeMacro: "A" | "B" | "C" = "C";
      if (total > 0 && row.salesValue13M > 0) {
        acum += row.salesValue13M;
        pctAcumTipo = acum / total;
        classeMacro = pctAcumTipo <= 0.8 ? "A" : pctAcumTipo <= 0.95 ? "B" : "C";
      }

      // Reclassificação BI (coluna "Classe ABC" da macro):
      // se classe != C mantém; se C e sem consumo recente -> E/D
      let curve: "A" | "B" | "C" | "D" | "E" = classeMacro;
      if (classeMacro === "C") {
        const uc = parseDate(row.ultimaCompra);
        if (row.nroMeses === 0 && uc && uc >= addDays(hoje, -180)) curve = "E";
        else if (row.nroMeses < 4 && uc && uc < addDays(hoje, -180)) curve = "D";
        else curve = "C";
      }

      // Excedente (R$): excesso de valor de estoque acima da cobertura máxima da classe
      const consumoDiarioValor = row.salesValue13M / 390;
      const coberturaMaximaValor = DIAS_MAXIMOS[classeMacro] * consumoDiarioValor;
      const excedenteR = row.stockValue > coberturaMaximaValor ? row.stockValue - coberturaMaximaValor : 0;

      result.push({ ...row, pctAcumTipo, classeMacro, curve, excedenteR });
    });
  });
  return result;
}