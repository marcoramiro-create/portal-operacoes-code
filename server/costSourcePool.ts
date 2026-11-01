import { Pool } from 'pg';

type CostSourceSegment = 'auto_parts' | 'industry';
const sourcePools = new Map<CostSourceSegment, Pool>();

/** Mesmo banco operacional; pools separados de autenticação e entre os segmentos. */
export function getCostSourcePool(segment: CostSourceSegment = 'auto_parts') {
  let pool = sourcePools.get(segment);
  if (!pool) {
    const connectionString = process.env.PORTAL_DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL;
    if (!connectionString) throw new Error('A conexão do banco das fontes de custos não está configurada.');
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      application_name: segment === 'industry' ? 'portal-industry-sources' : 'portal-cost-sources',
    });
    pool.on('error', err => console.error('[CostSourcesDatabase] Unexpected error on idle client:', err));
    sourcePools.set(segment, pool);
  }
  return pool;
}
