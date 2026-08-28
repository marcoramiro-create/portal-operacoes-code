import { Client } from 'pg';
const client = new Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const nodes = await client.query(`select id, node_key, label, parent_id, active from public.application_nodes where node_key like 'importacoes-%' or node_key = 'importacoes' order by parent_id nulls first, sort_order, node_key`);
  const permissions = await client.query(`select p.profile_key, n.node_key, string_agg(pn.permission, ',' order by pn.permission) permissions from public.profile_node_permissions pn join public.access_profiles p on p.id = pn.profile_id join public.application_nodes n on n.id = pn.node_id where n.node_key like 'importacoes-%' or n.node_key = 'importacoes' group by p.profile_key, n.node_key order by p.profile_key, n.node_key`);
  console.log(JSON.stringify({ nodes: nodes.rows, permissions: permissions.rows }, null, 2));
} finally { await client.end(); }
