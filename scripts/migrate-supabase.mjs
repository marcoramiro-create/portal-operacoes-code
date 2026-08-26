import { readFile } from "node:fs/promises";
import { Client } from "pg";

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL não está configurada.");

const migration = await readFile(new URL("../supabase/migrations/0001_portal_core.sql", import.meta.url), "utf8");
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(migration);
  console.log("Migração externa concluída com sucesso.");
} finally {
  await client.end();
}
