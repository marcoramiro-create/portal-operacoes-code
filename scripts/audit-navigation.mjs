import { Client } from "pg";

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL não está configurada.");

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const { rows } = await client.query(`
    select child.id, child.node_key, child.label, child.active, parent.node_key as parent_node_key
    from public.application_nodes child
    left join public.application_nodes parent on parent.id = child.parent_id
    where child.node_key in ('almoxarifado-cadastros', 'cadastros-estrutura-estoque')
    order by child.node_key
  `);
  console.table(rows);
} finally {
  await client.end();
}
