import { Pool } from 'pg';

let industryPool: Pool | null = null;

/** Exclusivo da Indústria; não altera o pool validado de Autopeças/autenticação. */
export function getCostSourcePool(segment: 'auto_parts' | 'industry' = 'industry') {
  if (segment !== 'industry') throw new Error('Pool industrial exclusivo: segmento inválido.');
  if (!industryPool) {
    const connectionString = process.env.PORTAL_DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL;
    if (!connectionString) throw new Error('A conexão do banco das fontes de custos não está configurada.');
    industryPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      application_name: 'portal-industry-sources',
    });
    industryPool.on('error', err => console.error('[IndustrySourcesDatabase] Unexpected error on idle client:', err));
  }
  return industryPool;
}
