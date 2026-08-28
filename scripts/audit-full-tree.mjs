import { Client } from 'pg';
const client = new Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const result = await client.query(`select n.id, n.node_key, n.label, p.node_key as parent_key, p.label as parent_label, p.sort_order as parent_sort_order, n.sort_order, count(distinct pp.profile_id)::int as profiles_with_permissions from public.application_nodes n left join public.application_nodes p on p.id = n.parent_id left join public.profile_node_permissions pp on pp.node_id = n.id where n.active = true group by n.id, n.node_key, n.label, p.node_key, p.label, p.sort_order, n.sort_order order by coalesce(p.sort_order, n.sort_order), p.node_key nulls first, n.sort_order, n.label`);
  console.log(JSON.stringify(result.rows, null, 2));
} finally { await client.end(); }
