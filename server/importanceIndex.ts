// ============================================================
// importanceIndex.ts — ÍNDICE DE IMPORTÂNCIA GLOBAL (Compras)
// ============================================================
// REGRAS DE NEGÓCIO (aprovadas pelo Marco em 08/11/2026):
//
//   Importância = (Valor estoque × 0,35)
//               + (Consumo 13M × 0,30)      [consumo = vendas 13M no Autopeças]
//               + (Fator curva × 0,20)
//               + (Fator cobertura × 0,15)
//
//   Fator curva: A=1,0 · B=0,7 · C=0,4 · D=0,2 · E=0,1
//
//   COBERTURA CONTRATUAL (régua do negócio, NÃO genérica):
//     A = 60 dias · B = 90 dias · C/D/E = 120 dias
//   Fator cobertura mede o DESVIO vs. a meta da curva do item:
//     • abaixo da meta (urgência): fator = min(1, (meta − cobertura) ÷ meta)
//     • acima da meta (excesso):   fator = min(1, (cobertura − meta) ÷ meta × 0,5)
//     • dentro de ±10% da meta:    fator = 0 (saudável, não empurra o índice)
//
// Os pesos (0,35/0,30/0,20/0,15) são ajustáveis na régua, como em Custos.
// Cálculo SEMPRE no código (nunca no Excel), regras comentadas no fonte.
// ============================================================

export type ItemImportancia = {
  code: string;
  codeOriginal: string | null;
  description: string;
  branch: string;
  family: string | null;
  curve: string | null;
  stockValue: number;
  salesValue13M: number;
  coverageDays: number;
  excessValue: number;
  importancia: number;
  componentes: {
    estoqueNorm: number;
    consumoNorm: number;
    fatorCurva: number;
    fatorCobertura: number;
  };
};

// Metas contratuais de cobertura por curva (dias).
export const META_COBERTURA: Record<string, number> = { A: 60, B: 90, C: 120, D: 120, E: 120 };
// Fator por curva (peso relativo de importância).
export const FATOR_CURVA: Record<string, number> = { A: 1.0, B: 0.7, C: 0.4, D: 0.2, E: 0.1 };
// Pesos do índice (soma 1,0).
export const PESOS = { estoque: 0.35, consumo: 0.3, curva: 0.2, cobertura: 0.15 };

export function fatorCoberturaContratual(curve: string | null, coverageDays: number): number {
  const meta = META_COBERTURA[(curve ?? "C").toUpperCase()] ?? 120;
  if (coverageDays <= 0) return 1; // Sem cobertura nenhuma: urgência máxima.
  const desvio = (coverageDays - meta) / meta; // >0 excesso · <0 urgência
  if (Math.abs(desvio) <= 0.1) return 0; // Banda saudável ±10%.
  if (desvio < 0) return Math.min(1, -desvio); // Urgência: quanto mais abaixo, maior.
  return Math.min(1, desvio * 0.5); // Excesso: cresce até dobrar a meta, peso menor.
}

/**
 * Calcula o índice de importância para uma lista de itens.
 * Cada componente é normalizado pelo máximo do conjunto antes de
 * receber o peso — os pesos comparam grandezas em escalas iguais.
 */
export function calcularImportancia<T extends {
  stockValue: number;
  salesValue13M: number;
  coverageDays: number;
  curve: string | null;
}>(itens: T[]): Array<T & { importancia: number; componentes: { estoqueNorm: number; consumoNorm: number; fatorCurva: number; fatorCobertura: number } }> {
  const maxEstoque = Math.max(0, ...itens.map(item => item.stockValue));
  const maxConsumo = Math.max(0, ...itens.map(item => item.salesValue13M));
  return itens.map(item => {
    const estoqueNorm = maxEstoque > 0 ? item.stockValue / maxEstoque : 0;
    const consumoNorm = maxConsumo > 0 ? item.salesValue13M / maxConsumo : 0;
    const fatorCurva = FATOR_CURVA[(item.curve ?? "E").toUpperCase()] ?? 0.1;
    const fatorCobertura = fatorCoberturaContratual(item.curve, item.coverageDays);
    const importancia = PESOS.estoque * estoqueNorm + PESOS.consumo * consumoNorm + PESOS.curva * fatorCurva + PESOS.cobertura * fatorCobertura;
    return { ...item, importancia: Math.round(importancia * 10000) / 10000, componentes: { estoqueNorm, consumoNorm, fatorCurva, fatorCobertura } };
  });
}
