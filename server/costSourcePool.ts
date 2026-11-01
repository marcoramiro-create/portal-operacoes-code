import { Pool } from 'pg';

let costSourcePool: Pool | null = null;

/** Mesmo banco das fontes operacionais; conexão independente do login e da sessão. */
export function getCostSourcePool() {
  if (!costSourcePool) {
    const connectionString = process.env.PORTAL_DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL;
    if (!connectionString) throw new Error('A conexão do banco das fontes de custos não está configurada.');
    costSourcePool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      application_name: 'portal-cost-sources',
    });
    costSourcePool.on('error', err => console.error('[CostSourcesDatabase] Unexpected error on idle client:', err));
  }
  return costSourcePool;
}
