import { describe, expect, it, vi } from 'vitest';
const stored = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('./industryConsumptionStore', () => ({ readIndustryConsumption: stored.read }));
import { obterConsumoIndustria } from './industryCostEvolutionAnalise';

describe('leitura persistida do consumo industrial', () => {
  it('consulta a versão publicada com período/filial/produto, preservando aliases', async () => {
    const query = vi.fn();
    stored.read.mockResolvedValue({
      consumo: new Map([['0105|00035-MGT|202501', 70]]),
      estoqueAgregado: new Map([['0105|00035-MGT', 100]]),
      versionId: 'version-test', refreshedAt: '2026-11-02T00:00:00Z', stale: false,
    });
    const pool = { query } as unknown as Parameters<typeof obterConsumoIndustria>[0];
    const result = await obterConsumoIndustria(pool, ['202501', '202609'], '0105', ['00001']);
    expect(stored.read).toHaveBeenCalledWith(pool, ['202501', '202609'], '0105', ['00001']);
    expect(query).not.toHaveBeenCalled();
    expect(result.consumo.get('0105|00035-MGT|202501')).toBe(70);
    expect(result.consumo.get('0105|35-MGT|202501')).toBe(70);
    expect(result.estoqueAgregado.get('0105|00035-MGT')).toBe(100);
  });
  it('não calcula fontes brutas como fallback quando a base está ausente', async () => {
    stored.read.mockRejectedValue(new Error('BASE_INDUSTRIAL_NAO_PREPARADA'));
    const query = vi.fn();
    await expect(obterConsumoIndustria({ query } as unknown as Parameters<typeof obterConsumoIndustria>[0], ['202501'], '0105'))
      .rejects.toThrow('BASE_INDUSTRIAL_NAO_PREPARADA');
    expect(query).not.toHaveBeenCalled();
  });
});
