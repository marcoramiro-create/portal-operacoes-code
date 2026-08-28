import { Client } from 'pg';
const client = new Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('begin');
  const root = await client.query(`insert into public.application_nodes (node_key, label, parent_id, sort_order, active)
    values ('tarefas-operacoes', 'Tarefas e operações', null, 30, true)
    on conflict (node_key) do update set label = excluded.label, parent_id = null, sort_order = excluded.sort_order, active = true
    returning id`);
  const rootId = root.rows[0].id;
  const childKeys = ['administracao', 'suprimentos-estoques', 'recebimentos', 'consumo-entregas', 'ativos-manutencao'];
  await client.query(`update public.application_nodes set parent_id = $1 where node_key = any($2::text[]) and active = true`, [rootId, childKeys]);
  await client.query(`update public.application_nodes set sort_order = case node_key
    when 'administracao' then 10 when 'suprimentos-estoques' then 20 when 'recebimentos' then 30 when 'consumo-entregas' then 40 when 'ativos-manutencao' then 50 else sort_order end
    where node_key = any($1::text[])`, [childKeys]);
  await client.query('commit');
  console.log('task-taxonomy-applied');
} catch (error) { await client.query('rollback'); throw error; }
finally { await client.end(); }
