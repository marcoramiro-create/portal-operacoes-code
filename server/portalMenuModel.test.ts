import { describe, expect, it } from "vitest";
import { MENU, menuPaths } from "../client/src/components/portalMenuModel";

describe("portal menu model", () => {
  it("mantém os grupos principais por responsabilidade", () => {
    expect(MENU.map(section => section.title)).toEqual(["Início", "Cadastros", "Importações", "Operações", "Análises", "Administração"]);
  });

  it("não repete caminhos e não mistura importação com cadastro", () => {
    const paths = menuPaths();
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.filter(path => path.startsWith("/importacoes/")).some(path => path.includes("/cadastros/") || path === "/cadastros")).toBe(false);
  });

  it("mantém os títulos das seções e oculta descrições individuais dos itens", () => {
    expect(MENU.map(section => section.title)).toEqual(["Início", "Cadastros", "Importações", "Operações", "Análises", "Administração"]);
    expect(MENU.flatMap(section => section.items).every(item => !("description" in item))).toBe(true);
    expect(MENU.every(section => Boolean(section.description))).toBe(true);
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
