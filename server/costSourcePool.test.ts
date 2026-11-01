import { expect, it, vi } from 'vitest';
import { getCostSourcePool } from './costSourcePool';
import { getSupabasePool } from './supabasePortal';

it('mantém o pool de custos separado do pool de autenticação, sem abrir conexão externa', async () => {
  vi.stubEnv('PORTAL_DATABASE_URL', 'postgresql://test:test@127.0.0.1:5432/portal_operacoes');
  try {
    const auth = getSupabasePool();
    const cost = getCostSourcePool();
    expect(cost).not.toBe(auth);
    expect(getCostSourcePool()).toBe(cost);
    expect(cost.options.application_name).toBe('portal-cost-sources');
    expect(cost.options.connectionString).toBe(auth.options.connectionString);
    expect(cost.totalCount).toBe(0);
    expect(auth.totalCount).toBe(0);
    await cost.end();
    await auth.end();
  } finally {
    vi.unstubAllEnvs();
  }
});
