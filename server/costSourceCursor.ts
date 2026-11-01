import type { Pool, QueryResultRow } from 'pg';

/** Cursor somente leitura: libera a conexão mesmo em falha ou interrupção do consumidor. */
export async function* streamCostSourceRows<Row extends QueryResultRow>(
  pool: Pick<Pool, 'connect'>,
  query: string,
  parameters: unknown[] = [],
): AsyncGenerator<Row> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '90s'");
    await client.query(`DECLARE portal_cost_source_cursor NO SCROLL CURSOR FOR ${query}`, parameters);
    while (true) {
      const batch = await client.query<Row>('FETCH FORWARD 1000 FROM portal_cost_source_cursor');
      if (batch.rows.length === 0) break;
      for (const row of batch.rows) yield row;
    }
    await client.query('CLOSE portal_cost_source_cursor');
    await client.query('COMMIT');
    committed = true;
  } finally {
    if (!committed) await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}
