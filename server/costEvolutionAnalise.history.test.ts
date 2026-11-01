import { describe, expect, it, vi } from 'vitest';
import { attachAutoPartsMonthlySales, calcularCustoTotal } from './costEvolutionAnalise';

describe('histórico de Compras na evolução de custos', () => {
  it('recupera 2025, reconhece Fev/Abr/Mai/Set e usa o zero da carga nova sem sobreposição', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [
      { branch: '0101', code: '4-MGT', codeOriginal: '00004-MGT', importId: 51, importedAt: '2026-01-06T08:01:00Z', salesMonths: { '202501': 2, 'Fev/2025': 3, 'Abr/2025': 4, 'Mai/2025': 5, 'Set/2025': 6, 'Out/2025': 7 } },
      { branch: '0101', code: '4-MGT', codeOriginal: '00004-MGT', importId: 63, importedAt: '2026-10-23T15:00:00Z', salesMonths: { 'Out/2025': 0 } },
      { branch: '0101', code: '4-MGT', codeOriginal: '00004-MGT', importId: 64, importedAt: '2026-11-01T15:45:00Z', salesMonths: { 'Nov/2025': 8 } },
    ] });
    const result = { items: [{ filial: '0101', codigo: 'OUTRO', cod_agregado: '00004-MGT', meses: ['202501','202502','202504','202505','202509','202510','202511','202503'].map(period => ({ period, custo_medio: 10, quantidade_vendida: 999 as number | null })) }] };
    await attachAutoPartsMonthlySales({ query } as unknown as Parameters<typeof attachAutoPartsMonthlySales>[0], result);
    expect(result.items[0].meses.map(m => m.quantidade_vendida)).toEqual([2,3,4,5,6,0,8,null]);
    expect(calcularCustoTotal(result.items, 'auto_parts')).toBe(280);
    expect(query.mock.calls[0][0]).toContain("i.status = 'approved'");
    expect(query.mock.calls[0][0]).not.toContain('limit 1');
  });

  it('Indústria soma o valor de consumo uma vez por filial/agregado/mês, sem multiplicar pelo custo', () => {
    const items = [
      { filial: '0105', codigo: '00001', cod_agregado: 'AG-1', meses: [{ period: '202501', custo_medio: 20, valor_consumo: 100 }] },
      { filial: '0105', codigo: '00002', cod_agregado: 'AG-1', meses: [{ period: '202501', custo_medio: 500, valor_consumo: 100 }] },
      { filial: '0105', codigo: '00003', cod_agregado: 'AG-2', meses: [{ period: '202501', custo_medio: 9, valor_consumo: 70 }] },
    ];
    expect(calcularCustoTotal(items, 'industry')).toBe(170);
  });

  it('Autopeças mantém a soma item a item e mês a mês', () => {
    const items = [
      { filial: '0101', codigo: 'A', cod_agregado: 'AG', meses: [{ period: '202501', custo_medio: 10, quantidade_vendida: 2 }] },
      { filial: '0101', codigo: 'B', cod_agregado: 'AG', meses: [{ period: '202501', custo_medio: 15, quantidade_vendida: 2 }] },
    ];
    expect(calcularCustoTotal(items, 'auto_parts')).toBe(50);
  });
});
