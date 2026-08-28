import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  const importRoot = await client.query("select id from public.application_nodes where node_key = 'importacoes' and active = true");
  if (!importRoot.rows[0]) throw new Error("Raiz Importações não encontrada.");

  const importers = [
    ["importacoes-custos-autopecas", "Importar · Evolução de custos de autopeças", 100],
    ["importacoes-custos-industria", "Importar · Evolução de custos da indústria", 110],
  ];
  for (const [nodeKey, label, sortOrder] of importers) {
    await client.query(
      `insert into public.application_nodes (node_key, label, parent_id, sort_order, active)
       values ($1, $2, $3, $4, true)
       on conflict (node_key) do update set label = excluded.label, parent_id = excluded.parent_id, sort_order = excluded.sort_order, active = true`,
      [nodeKey, label, importRoot.rows[0].id, sortOrder],
    );
  }

  await client.query("update public.application_nodes set label = 'Evolução de custos de autopeças', active = true where node_key = 'custos-autopecas'");
  await client.query("update public.application_nodes set label = 'Evolução de custos da indústria', active = true where node_key = 'custos-industria'");

  const profiles = await client.query("select id, profile_key from public.access_profiles where active = true and profile_key in ('development-admin', 'operations-admin', 'admin', 'administrator')");
  const nodes = await client.query("select id from public.application_nodes where node_key = any($1::text[])", [[...importers.map(item => item[0]), "custos-autopecas", "custos-industria"]]);
  for (const profile of profiles.rows) {
    for (const node of nodes.rows) {
      for (const permission of ["view", "manage", "approve"]) {
        await client.query("insert into public.profile_node_permissions (profile_id, node_id, permission) values ($1, $2, $3) on conflict do nothing", [profile.id, node.id, permission]);
      }
    }
  }

  await client.query("COMMIT");
  console.log(JSON.stringify({ importers: importers.length, profiles: profiles.rows.map(row => row.profile_key), nodes: nodes.rows.length }));
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
