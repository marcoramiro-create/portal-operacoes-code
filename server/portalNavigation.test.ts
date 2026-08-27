import { describe, expect, it } from "vitest";
import { applicationPaths, PORTAL_HOME_PATH } from "../client/src/lib/portalNavigation";

describe("portal navigation", () => {
  it("keeps the root route as the neutral portal home", () => {
    expect(PORTAL_HOME_PATH).toBe("/");
  });

  it("uses a dedicated route for the Protheus application", () => {
    expect(applicationPaths["compras-protheus"]).toBe("/compras/protheus");
  });

  it("exposes the central importer routes for Protheus and registries", () => {
    expect(applicationPaths["importacoes-compras-protheus"]).toBe("/importacoes/compras-protheus");
    expect(applicationPaths["importacoes-fornecedores"]).toBe("/importacoes/fornecedores");
    expect(applicationPaths["importacoes-produtos"]).toBe("/importacoes/produtos");
    expect(applicationPaths["importacoes-centros-custo"]).toBe("/importacoes/centros-custo");
  });

  it("organizes the stock references as individual entries under Cadastros", () => {
    expect(applicationPaths["cadastros-empresas"]).toBe("/cadastros/empresas");
    expect(applicationPaths["cadastros-filiais"]).toBe("/cadastros/filiais");
    expect(applicationPaths["cadastros-armazens"]).toBe("/cadastros/armazens");
    expect(applicationPaths["cadastros-locais-estoque"]).toBe("/cadastros/locais-estoque");
    expect(applicationPaths["cadastros-estrutura-estoque"]).toBeUndefined();
  });
});
