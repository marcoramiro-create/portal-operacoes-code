import { Client } from 'pg';
const client = new Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
const pairs = [
  ['empilhadeiras', 'ativos-empilhadeiras'],
  ['equipamentos-industria', 'ativos-equipamentos-industria'],
  ['ferramentas', 'ativos-ferramentas'],
];
await client.connect();
try {
  await client.query('begin');
  for (const [obsoleteKey, canonicalKey] of pairs) {
    const obsolete = await client.query(`select id from public.application_nodes where node_key = $1`, [obsoleteKey]);
    const canonical = await client.query(`select id from public.application_nodes where node_key = $1`, [canonicalKey]);
    if (!obsolete.rows[0] || !canonical.rows[0]) throw new Error(`Nó ausente: ${obsoleteKey} ou ${canonicalKey}`);
    const oldId = obsolete.rows[0].id;
    const newId = canonical.rows[0].id;
    await client.query(`insert into public.profile_node_permissions (profile_id, node_id, permission)
      select profile_id, $2, permission from public.profile_node_permissions where node_id = $1
      on conflict do nothing`, [oldId, newId]);
    await client.query(`insert into public.user_node_permissions (user_id, node_id, permission, allowed, updated_by_user_id)
      select user_id, $2, permission, allowed, updated_by_user_id from public.user_node_permissions old
      where old.node_id = $1
      on conflict (user_id, node_id, permission) do nothing`, [oldId, newId]);
    await client.query(`update public.application_nodes set active = false, label = label || ' (descontinuado)' where id = $1`, [oldId]);
  }
  await client.query('commit');
  console.log('asset-nodes-deduplicated');
} catch (error) {
  await client.query('rollback');
  throw error;
} finally { await client.end(); }
