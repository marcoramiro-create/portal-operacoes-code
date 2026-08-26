import { Client } from "pg";
import { describe, expect, it } from "vitest";

const connectionString = process.env.SUPABASE_DATABASE_URL;

describe("banco PostgreSQL externo", () => {
  it.skipIf(!connectionString)("executa uma consulta mínima no projeto Supabase", async () => {
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10_000,
    });

    try {
      await client.connect();
      const result = await client.query<{ status: number }>("select 1 as status");
      expect(result.rows[0]?.status).toBe(1);
    } finally {
      await client.end();
    }
  });
});
