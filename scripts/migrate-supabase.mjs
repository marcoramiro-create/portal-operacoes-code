import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL não está configurada.");

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const migrationFiles = (await readdir(migrationsDirectory))
  .filter(file => file.endsWith(".sql"))
  .sort();
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  for (const file of migrationFiles) {
    const migration = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
    await client.query(migration);
    console.log(`Aplicada: ${file}`);
  }
  console.log("Migrações externas concluídas com sucesso.");
} finally {
  await client.end();
}
