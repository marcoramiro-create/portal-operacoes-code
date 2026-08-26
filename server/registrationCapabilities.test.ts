import { describe, expect, it } from "vitest";
import { canShowRegistrationManagement } from "../shared/registrationCapabilities";

describe("visibilidade da administração de cadastros", () => {
  it("oculta controles administrativos sem a capacidade manage", () => {
    expect(canShowRegistrationManagement({ view: true, create: true, import: false, manage: false })).toBe(false);
  });

  it("exibe controles administrativos somente com a capacidade manage", () => {
    expect(canShowRegistrationManagement({ view: true, create: false, import: false, manage: true })).toBe(true);
  });
});
