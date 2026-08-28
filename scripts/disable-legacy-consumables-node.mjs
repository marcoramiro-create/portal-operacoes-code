import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  const result = await pool.query(
    "update public.application_nodes set active = false where node_key = $1 and active = true returning node_key, label",
    ["consumiveis-epis-uniformes"],
  );
  console.log(JSON.stringify({ deactivated: result.rows }));
} finally {
  await pool.end();
}
