import { describe, expect, it } from "vitest";
import { canAdministerProtheusImports } from "./routers/analytics";

describe("governança das versões Protheus", () => {
  it("permite governança ao administrador técnico", () => {
    expect(canAdministerProtheusImports({ isDevelopmentAdmin: true, profiles: [] })).toBe(true);
  });

  it("permite governança ao perfil operations-admin", () => {
    expect(canAdministerProtheusImports({ isDevelopmentAdmin: false, profiles: ["operations-admin"] })).toBe(true);
  });

  it("bloqueia governança para usuário operacional comum", () => {
    expect(canAdministerProtheusImports({ isDevelopmentAdmin: false, profiles: ["operations-user"] })).toBe(false);
  });
});

// A consulta e a mutação continuam protegidas no servidor; estes testes cobrem a regra pura de visibilidade.
