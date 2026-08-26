import { describe, expect, it } from "vitest";
import { defaultRegistrationOperations } from "./registrationAccess";

describe("matriz de permissões de cadastros", () => {
  it("concede todas as operações ao administrador operacional", () => {
    expect(defaultRegistrationOperations({ isDevelopmentAdmin: false, profiles: ["operations-admin"] })).toEqual({ view: true, create: true, import: true, manage: true });
  });

  it("não concede importar nem administrar ao gestor", () => {
    expect(defaultRegistrationOperations({ isDevelopmentAdmin: false, profiles: ["manager"] })).toEqual({ view: true, create: true, import: false, manage: false });
  });

  it("limita o operador à consulta enquanto não houver liberação individual", () => {
    expect(defaultRegistrationOperations({ isDevelopmentAdmin: false, profiles: ["operator"] })).toEqual({ view: true, create: false, import: false, manage: false });
  });
});
