// Reconstrução da base industrial na PRODUÇÃO (banco portal_operacoes_prod).
//
// Regras de negócio (padrão do projeto — comentadas no fonte):
// - A base industrial cobre SOMENTE a filial 0105 (Indústria). Linhas de outras
//   filiais são EXCLUÍDAS pela consulta de origem (WHERE branch = 0105) e não
//   interrompem o rebuild; linhas com filial/produto VAZIOS abortam o rebuild
//   inteiro (transação rollback, nada é substituído) — por isso o preflight
//   abaixo conta e reporta essas linhas ANTES de qualquer escrita.
// - Fontes exigidas: lotes FECHAMENTO_ESTOQUE e ENTRADA_NF processados.
//   A SB9 NÃO participa deste rebuild (alimenta custo médio mensal à parte).
// - Rebuild transacional com advisory lock no store: ou publica a versão
//   completa e atualiza o head, ou não substitui nada.
// - nf_receipts NÃO é alterado pelo rebuild; é contado antes/depois como evidência.
// - Uso: sudo -n python3 scripts/production/runIndustryConsumptionRebuildProd.py
//   (o wrapper Python injeta INDUSTRY_REBUILD_CONFIRM e o ambiente do serviço).
import { Pool } from 'pg';
import { rebuildIndustryConsumption } from '../../server/industryConsumptionStore';

if (process.env.INDUSTRY_REBUILD_CONFIRM !== 'PRODUCAO') {
  throw new Error('Reconstrução bloqueada. Defina INDUSTRY_REBUILD_CONFIRM=PRODUCAO somente ao executar na Produção.');
}

const connectionString = process.env.PORTAL_DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL;
const dbName = connectionString ? new URL(connectionString).pathname.replace(/^\//, '') : '';
if (!connectionString || dbName !== 'portal_operacoes_prod') {
  throw new Error(`Reconstrução bloqueada: banco diferente da Produção autorizada (portal_operacoes_prod). Recebido: ${dbName || '(ausente)'}`);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  application_name: 'portal-industry-materializer-prod',
});

type CountRow = { n: number };
type BatchRow = { source_kind: string; batches: number; rows: string };
type BranchRow = { branch: string; n: number };
type HeadRow = { id: string; status: string; published_at: string | null };

try {
  // ---- Preflight somente-leitura (nenhuma escrita nesta etapa) ----
  const client = await pool.connect();
  let before = -1;
  try {
    await client.query("SET statement_timeout = '120s'");

    const environment = await client.query<{ value: string }>(
      "SELECT value FROM public.portal_schema_info WHERE key = 'environment'",
    );
    const envValue = environment.rows[0]?.value ?? '(ausente)';
    if (envValue !== 'production') {
      throw new Error(`Preflight bloqueado: portal_schema_info.environment = '${envValue}' (esperado 'production').`);
    }

    const receiptsBefore = await client.query<CountRow>('SELECT count(*)::int AS n FROM public.nf_receipts');
    before = receiptsBefore.rows[0]?.n ?? -1;

    const batches = await client.query<BatchRow>(
      `SELECT source_kind, count(*)::int AS batches, COALESCE(sum(row_count), 0)::bigint AS rows
         FROM public.operational_import_batches
        WHERE status = 'processed' AND source_kind IN ('FECHAMENTO_ESTOQUE', 'ENTRADA_NF')
        GROUP BY source_kind ORDER BY source_kind`,
    );
    const kinds = new Set(batches.rows.map(row => row.source_kind));
    if (!kinds.has('FECHAMENTO_ESTOQUE') || !kinds.has('ENTRADA_NF')) {
      throw new Error(
        `Preflight bloqueado: fontes processadas insuficientes (${[...kinds].join(', ') || 'nenhuma'}). ` +
        'Exigidas: FECHAMENTO_ESTOQUE e ENTRADA_NF.',
      );
    }

    const branches = await client.query<BranchRow>(
      `SELECT COALESCE(NULLIF(trim(r.branch_code), ''), '(vazio)') AS branch, count(*)::int AS n
         FROM public.operational_source_rows r
         JOIN public.operational_import_batches b ON b.id = r.batch_id
        WHERE b.status = 'processed' AND b.source_kind IN ('FECHAMENTO_ESTOQUE', 'ENTRADA_NF')
        GROUP BY 1 ORDER BY n DESC`,
    );

    // Risco real de aborto: linhas da 0105 com produto vazio (ensureBranchProduct
    // lança erro e a transação inteira é revertida). Linhas de outras filiais —
    // inclusive com filial vazia — são filtradas pelo SQL de origem e não abortam.
    const malformed = await client.query<CountRow>(
      `SELECT count(*)::int AS n
         FROM public.operational_source_rows r
         JOIN public.operational_import_batches b ON b.id = r.batch_id
        WHERE b.status = 'processed' AND b.source_kind IN ('FECHAMENTO_ESTOQUE', 'ENTRADA_NF')
          AND trim(r.branch_code) = '0105'
          AND NULLIF(trim(r.product_code), '') IS NULL`,
    );
    if ((malformed.rows[0]?.n ?? 0) > 0) {
      throw new Error(
        `Preflight bloqueado: ${malformed.rows[0].n} linha(s) da filial 0105 com produto vazio nas fontes. ` +
        'Essas linhas abortariam o rebuild inteiro; trate o lote de origem antes de reconstruir.',
      );
    }

    // Estado atual do head (tabelas podem não existir se a 0061 ainda não foi aplicada).
    let head: HeadRow | null = null;
    try {
      const headResult = await client.query<HeadRow>(
        `SELECT v.id, v.status, v.published_at
           FROM public.industry_consumption_head h
           JOIN public.industry_consumption_versions v ON v.id = h.version_id`,
      );
      head = headResult.rows[0] ?? null;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (code !== '42P01') throw error;
      throw new Error('Preflight bloqueado: tabelas do read model industrial ausentes. Rode antes o instalador do pacote (aplica a migração 0061).');
    }

    // Permissão do papel do serviço: o rebuild roda com o mesmo papel da aplicação.
    // Se as tabelas foram criadas pelo postgres sem grants (padrão da 0061 é
    // conceder ao portal_app), o INSERT falharia no meio do rebuild.
    const privs = await client.query<{ usr: string; can_insert: boolean }>(
      `SELECT current_user AS usr,
              has_table_privilege(current_user, 'public.industry_consumption_versions', 'INSERT') AS can_insert`,
    );
    if (privs.rows[0] && !privs.rows[0].can_insert) {
      throw new Error(
        `Preflight bloqueado: o papel do serviço (${privs.rows[0].usr}) não tem INSERT em industry_consumption_versions. ` +
        'Aplique os GRANTs da migração 0061 para esse papel antes de reconstruir.',
      );
    }

    console.log('[Base industrial][preflight] ambiente=production nf_receipts=', before);
    for (const row of batches.rows) {
      console.log(`[Base industrial][preflight] ${row.source_kind}: ${row.batches} lote(s), ${row.rows} linha(s)`);
    }
    for (const row of branches.rows) {
      const participa = row.branch === '0105' ? ' (participa do cálculo)' : ' (EXCLUÍDA: fora da filial industrial 0105)';
      console.log(`[Base industrial][preflight] filial ${row.branch}: ${row.n} linha(s)${participa}`);
    }
    if (!branches.rows.some(row => row.branch === '0105')) {
      throw new Error('Preflight bloqueado: nenhuma linha da filial industrial 0105 — o rebuild não teria o que calcular.');
    }

    // Aborto real nº 2: valores que o validador do store rejeita — número vazio
    // (NULL/ausente vira "" e lança erro), número com vírgula (formato BR) ou
    // ano/mês/entryDate fora do formato. Uma única linha assim reverte a
    // transação inteira do rebuild.
    const badNumbers = await client.query<CountRow>(
      `SELECT count(*)::int AS n
         FROM public.operational_source_rows r
         JOIN public.operational_import_batches b ON b.id = r.batch_id
        WHERE b.status = 'processed' AND b.source_kind IN ('FECHAMENTO_ESTOQUE', 'ENTRADA_NF')
          AND trim(r.branch_code) = '0105'
          AND (
            (b.source_kind = 'FECHAMENTO_ESTOQUE'
              AND (r.normalized_payload->>'totalValue' IS NULL
                   OR r.normalized_payload->>'totalValue' !~ '^-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)$'
                   OR NOT (r.normalized_payload->>'year' ~ '^\\d{4}$'
                           AND r.normalized_payload->>'month' ~ '^\\d{1,2}$')))
            OR (b.source_kind = 'ENTRADA_NF'
              AND (r.normalized_payload->>'quantity' IS NULL
                   OR r.normalized_payload->>'itemValue' IS NULL
                   OR r.normalized_payload->>'quantity' !~ '^-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)$'
                   OR r.normalized_payload->>'itemValue' !~ '^-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)$'
                   OR r.normalized_payload->>'entryDate' !~ '^\\d{4}-\\d{2}(-|$)'))
          )`,
    );
    if ((badNumbers.rows[0]?.n ?? 0) > 0) {
      throw new Error(
        `Preflight bloqueado: ${badNumbers.rows[0].n} linha(s) da 0105 com número fora do formato ponto-decimal. ` +
        'O validador do store rejeita vírgula; corrija o lote de origem antes de reconstruir.',
      );
    }
    console.log('[Base industrial][preflight] head atual:', head ? JSON.stringify(head) : '(vazio — primeira publicação)');
  } finally {
    client.release();
  }

  // ---- Reconstrução: transação única com advisory lock dentro do store ----
  const result = await rebuildIndustryConsumption(pool);
  console.log('[Base industrial] Versão publicada:', JSON.stringify(result));

  // ---- Evidência pós-execução ----
  const receiptsAfter = await pool.query<CountRow>('SELECT count(*)::int AS n FROM public.nf_receipts');
  const after = receiptsAfter.rows[0]?.n ?? -1;
  console.log(`[Base industrial] nf_receipts antes=${before} depois=${after}${before === after ? ' (preservado)' : ' (ALTERADO — investigar imediatamente)'}`);
  if (before !== after) process.exitCode = 1;
} catch (error) {
  console.error('[Base industrial] Falha. A versão anterior não foi substituída:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
