import { Client } from 'pg';
const client = new Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const duplicates = await client.query(`select coalesce(p.node_key, '<root>') as parent_key, n.label, count(*)::int as total, string_agg(n.node_key, ', ' order by n.node_key) as node_keys from public.application_nodes n left join public.application_nodes p on p.id = n.parent_id where n.active = true group by p.node_key, n.label having count(*) > 1 order by parent_key, n.label`);
  const activeAssets = await client.query(`select n.node_key, n.label, p.node_key as parent_key from public.application_nodes n left join public.application_nodes p on p.id = n.parent_id where n.active = true and (n.node_key like '%empilhadeira%' or n.node_key like '%equipamento%' or n.node_key like '%ferramenta%') order by n.node_key`);
  console.log(JSON.stringify({duplicates: duplicates.rows, activeAssets: activeAssets.rows}, null, 2));
} finally { await client.end(); }
