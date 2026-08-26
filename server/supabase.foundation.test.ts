import { Client } from "pg";
import { describe, expect, it } from "vitest";

const connectionString = process.env.SUPABASE_DATABASE_URL;
const expectedTables = [
  "org_units",
  "cost_centers",
  "employees",
  "suppliers",
  "products",
  "application_nodes",
  "access_profiles",
  "portal_users",
  "user_access_requests",
  "user_profile_assignments",
  "profile_node_permissions",
  "audit_events",
];

describe("fundação externa do portal", () => {
  it.skipIf(!connectionString)("cria as tabelas centrais no Supabase", async () => {
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      const result = await client.query<{ table_name: string }>(
        "select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])",
        [expectedTables],
      );
      expect(result.rows.map(row => row.table_name).sort()).toEqual([...expectedTables].sort());
    } finally {
      await client.end();
    }
  });
});
