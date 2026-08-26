import { describe, expect, it } from "vitest";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("conexão Supabase externa", () => {
  it.skipIf(!supabaseUrl || !serviceRoleKey)("valida a chave de serviço no endpoint REST do projeto", async () => {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: serviceRoleKey!,
        Authorization: `Bearer ${serviceRoleKey!}`,
      },
    });

    expect(response.ok).toBe(true);
  });
});
