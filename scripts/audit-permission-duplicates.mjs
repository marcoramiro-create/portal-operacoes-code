import { Client } from 'pg';
const client = new Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const duplicates = await client.query(`select profile_id, node_id, permission, count(*)::int as total from public.profile_node_permissions group by profile_id, node_id, permission having count(*) > 1 order by total desc`);
  const profilePermissionCounts = await client.query(`select p.profile_key, n.node_key, count(*)::int as permissions, string_agg(pn.permission, ',' order by pn.permission) as permission_list from public.profile_node_permissions pn join public.access_profiles p on p.id = pn.profile_id join public.application_nodes n on n.id = pn.node_id group by p.profile_key, n.node_key order by p.profile_key, n.node_key`);
  console.log(JSON.stringify({ duplicates: duplicates.rows, profilePermissionCounts: profilePermissionCounts.rows }, null, 2));
} finally { await client.end(); }
