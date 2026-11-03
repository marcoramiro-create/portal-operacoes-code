import { Pool } from 'pg';
import { rebuildIndustryConsumption } from '../server/industryConsumptionStore';

const connectionString = process.env.PORTAL_DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL;
if (!connectionString || new URL(connectionString).pathname.replace(/^\//, '') !== 'portal_operacoes') {
  throw new Error('Reconstrução bloqueada: banco diferente da Homologação autorizada.');
}
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  application_name: 'portal-industry-materializer',
});
try {
  console.log('[Base industrial] Iniciando processamento fora da consulta da tela.');
  const result = await rebuildIndustryConsumption(pool);
  console.log('[Base industrial] Versão publicada:', JSON.stringify(result));
} catch (error) {
  console.error('[Base industrial] Falha. A versão anterior não foi substituída:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
