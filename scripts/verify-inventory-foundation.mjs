import { Client } from "pg";

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL não está configurada.");

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const result = await client.query(`
    select
      (select count(*) from public.product_types) as product_types,
      (select count(*) from public.companies) as companies,
      (select count(*) from public.branches) as branches,
      (select count(*) from public.warehouses) as warehouses,
      (select count(*) from public.stock_locations) as stock_locations,
      (select count(*) from public.application_nodes where node_key like 'almoxarifado%') as warehouse_nodes
  `);
  console.log(JSON.stringify(result.rows[0]));
} finally {
  await client.end();
}
