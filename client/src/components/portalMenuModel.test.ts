import { describe, expect, it } from "vitest";
import { MENU, menuPaths } from "./portalMenuModel";

describe("portal menu model", () => {
  it("mantém os grupos principais por responsabilidade", () => {
    expect(MENU.map(section => section.title)).toEqual(["Início", "Cadastros", "Importações", "Operações", "Análises", "Administração"]);
  });

  it("não repete caminhos e não mistura importação com cadastro", () => {
    const paths = menuPaths();
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.filter(path => path.startsWith("/importacoes/")).some(path => path.includes("/cadastros/") || path === "/cadastros")).toBe(false);
  });

  it("mantém os cadastros mestres na seção Cadastros", () => {
    const section = MENU.find(item => item.title === "Cadastros");
    expect(section?.items.map(item => item.path)).toEqual(expect.arrayContaining([
      "/cadastros/empresas", "/cadastros/filiais", "/cadastros/funcionarios", "/cadastros/fornecedores", "/cadastros/produtos",
    ]));
  });

  it("mantém o recebimento e almoxarifado em Operações", () => {
    const section = MENU.find(item => item.title === "Operações");
    expect(section?.items.map(item => item.path)).toEqual(expect.arrayContaining([
      "/recebimentos/nf", "/almoxarifado/requisicoes", "/almoxarifado/estoque",
    ]));
  });
});
