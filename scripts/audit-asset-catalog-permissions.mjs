import pg from "pg";
const { Client } = pg;
const client = new Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const result = await client.query(`select n.node_key, n.label, n.active, p.profile_key, array_agg(distinct pp.permission order by pp.permission) as permissions from public.application_nodes n left join public.profile_node_permissions pp on pp.node_id = n.id left join public.access_profiles p on p.id = pp.profile_id where n.node_key in ('cadastros-ativos-empilhadeiras','cadastros-ativos-equipamentos-industria','cadastros-ativos-ferramentas') group by n.node_key, n.label, n.active, p.profile_key order by n.node_key, p.profile_key`);
  console.log(JSON.stringify(result.rows, null, 2));
} finally { await client.end(); }
