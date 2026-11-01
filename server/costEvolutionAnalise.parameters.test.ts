import { describe, expect, it, vi } from 'vitest';
import { obterConsumoIndustria } from './costEvolutionAnalise';

describe('parâmetros SQL do consumo industrial', () => {
  it('aplica filial, intervalo e produtos antes da leitura em lotes', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const release = vi.fn();
    const connect = vi.fn().mockResolvedValue({ query, release });
    await obterConsumoIndustria({ connect } as unknown as Parameters<typeof obterConsumoIndustria>[0], ['202501', '202609'], 'TEST_PARAMETERS_0105', ['03545-MGT']);
    const declarations = query.mock.calls.filter(([sql]) => String(sql).startsWith('DECLARE'));
    expect(declarations).toHaveLength(2);
    expect(declarations[0][1]).toEqual(['TEST_PARAMETERS_0105', '202412', '202609', ['03545-MGT']]);
    expect(declarations[1][1]).toEqual(['TEST_PARAMETERS_0105', '202501', '202609', ['03545-MGT']]);
    for (const [sql, params] of declarations) {
      expect(sql).toContain('r.branch_code = $1');
      expect(sql).toContain('between $2 and $3');
      expect(sql).toContain('any($4::text[])');
      expect(sql).not.toMatch(/GROUP BY|ORDER BY|\bLAG\(/i);
      const placeholders = [...sql.matchAll(/\$(\d+)/g)].map(match => Number(match[1]));
      expect(Math.max(...placeholders)).toBe(params.length);
    }
    expect(release).toHaveBeenCalledTimes(2);
  });
});
