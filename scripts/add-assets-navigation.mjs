import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const root = await client.query(`INSERT INTO public.application_nodes (node_key, label, parent_id, sort_order, active) VALUES ('ativos-manutencao', 'Ativos e manutenção', NULL, 50, true) ON CONFLICT (node_key) DO UPDATE SET label = EXCLUDED.label, active = true RETURNING id`);
  const rootId = root.rows[0]?.id ?? (await client.query(`SELECT id FROM public.application_nodes WHERE node_key = 'ativos-manutencao'`)).rows[0].id;
  const children = [['ativos-empilhadeiras', 'Empilhadeiras', 10], ['ativos-equipamentos-industria', 'Equipamentos da indústria', 20], ['ativos-ferramentas', 'Ferramentas de oficinas e indústria', 30]];
  for (const [nodeKey, label, sortOrder] of children) await client.query(`INSERT INTO public.application_nodes (node_key, label, parent_id, sort_order, active) VALUES ($1, $2, $3, $4, true) ON CONFLICT (node_key) DO UPDATE SET label = EXCLUDED.label, parent_id = EXCLUDED.parent_id, active = true`, [nodeKey, label, rootId, sortOrder]);
  const profiles = await client.query(`SELECT id, profile_key FROM public.access_profiles WHERE active = true AND profile_key IN ('admin', 'administrator', 'operations-admin')`);
  const nodes = await client.query(`SELECT id FROM public.application_nodes WHERE node_key = ANY($1::text[])`, [['ativos-manutencao', ...children.map(item => item[0])]]);
  for (const profile of profiles.rows) for (const node of nodes.rows) for (const permission of ['view', 'manage', 'approve']) await client.query(`INSERT INTO public.profile_node_permissions (profile_id, node_id, permission) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [profile.id, node.id, permission]);
  await client.query('COMMIT');
  console.log(JSON.stringify({ rootId, profiles: profiles.rows.map(row => row.profile_key), nodes: nodes.rows.length }));
} catch (error) { await client.query('ROLLBACK'); console.error(error); process.exitCode = 1; } finally { client.release(); await pool.end(); }
