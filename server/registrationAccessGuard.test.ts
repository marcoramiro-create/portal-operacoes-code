import { describe, expect, it, vi } from "vitest";

vi.mock("./supabasePortal", () => ({
  getSupabasePool: () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }),
}));

import { assertRegistrationOperation } from "./registrationAccess";

describe("guard da operação Administrar", () => {
  it("nega a administração de cadastro ao usuário operacional", async () => {
    await expect(assertRegistrationOperation({ id: "user", email: "operator@example.com", displayName: null, isDevelopmentAdmin: false, profiles: ["operator"] }, "products", "manage")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("permite a administração de cadastro ao administrador operacional", async () => {
    await expect(assertRegistrationOperation({ id: "admin", email: "admin@example.com", displayName: null, isDevelopmentAdmin: false, profiles: ["operations-admin"] }, "products", "manage")).resolves.toMatchObject({ manage: true });
  });
});
