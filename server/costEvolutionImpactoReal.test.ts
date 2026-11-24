import { describe, expect, it } from 'vitest';
import { impactoRealDoItem as impactoAutopecas } from './costEvolutionAnalise';
import { impactoRealDoItem as impactoIndustria } from './industryCostEvolutionAnalise';

type Mes = { period: string; custo_medio: number | null; quantidade_vendida?: number | null; valor_consumo?: number | null };
type Item = { filial?: string; codigo: string; cod_agregado?: string | null; curve?: string; meses: Mes[] };

// REGRA DO MARCO (24/11/2026): impacto real = para cada mês transacionado,
// (custo do mês − último custo anterior) × quantidade do mês. O custo médio
// fica como está (bonificação a 1,29 é entrada real); só o impacto muda.
describe('impacto real — Autopeças', () => {
  it('12864/0101: bonificação a 1,29, custo real 439,15, venda de 21 un → 9.195,06 (não 3,1MM)', () => {
    const item: Item = {
      filial: '0101', codigo: '12864', cod_agregado: '12864', curve: 'A',
      meses: [
        { period: '202509', custo_medio: 1.29, quantidade_vendida: 0 },
        { period: '202510', custo_medio: 1.29, quantidade_vendida: 0 },
        { period: '202511', custo_medio: 1.29, quantidade_vendida: 0 },
        { period: '202512', custo_medio: 1.29, quantidade_vendida: 0 },
        { period: '202601', custo_medio: 1.29, quantidade_vendida: 0 },
        { period: '202602', custo_medio: 1.29, quantidade_vendida: 0 },
        { period: '202603', custo_medio: 1.29, quantidade_vendida: 0 },
        { period: '202604', custo_medio: 1.29, quantidade_vendida: 0 },
        { period: '202605', custo_medio: 1.29, quantidade_vendida: 0 },
        { period: '202610', custo_medio: 439.15, quantidade_vendida: 21 },
      ],
    };
    expect(impactoAutopecas(item as never, 'auto_parts')).toBe(9195.06);
  });

  it('sem transação em mês de custo novo → impacto null', () => {
    const item: Item = {
      filial: '0101', codigo: 'X', meses: [
        { period: '202501', custo_medio: 10, quantidade_vendida: 0 },
        { period: '202502', custo_medio: 12, quantidade_vendida: 0 },
      ],
    };
    expect(impactoAutopecas(item as never, 'auto_parts')).toBeNull();
  });

  it('variações intermediárias acumulam mês a mês', () => {
    const item: Item = {
      filial: '0101', codigo: 'Y', meses: [
        { period: '202501', custo_medio: 100, quantidade_vendida: 5 },
        { period: '202502', custo_medio: 110, quantidade_vendida: 5 },
        { period: '202503', custo_medio: 105, quantidade_vendida: 5 },
      ],
    };
    // (110-100)*5 + (105-110)*5 = 50 - 25 = 25
    expect(impactoAutopecas(item as never, 'auto_parts')).toBe(25);
  });

  it('mês sem custo (sem movimento) não gera impacto nem muda a base', () => {
    const item: Item = {
      filial: '0101', codigo: 'W', meses: [
        { period: '202501', custo_medio: 50, quantidade_vendida: 2 },
        { period: '202502', custo_medio: null, quantidade_vendida: 2 },
        { period: '202503', custo_medio: 60, quantidade_vendida: 2 },
      ],
    };
    // 202503: (60-50)*2 = 20
    expect(impactoAutopecas(item as never, 'auto_parts')).toBe(20);
  });
});

describe('impacto real — Indústria', () => {
  it('quantidade implícita = valor de consumo ÷ custo do mês (resultado em R$)', () => {
    const item: Item = {
      filial: '0105', codigo: 'Z', meses: [
        { period: '202501', custo_medio: 20, valor_consumo: 100 },
        { period: '202502', custo_medio: 25, valor_consumo: 100 },
      ],
    };
    // 202502: qtd = 100/25 = 4; (25-20)*4 = 20
    expect(impactoIndustria(item as never, 'industry')).toBe(20);
  });
});
