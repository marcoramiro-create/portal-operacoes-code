import { describe, expect, it } from "vitest";
import { buildApplicationTree, normalizeProfileKeys } from "./supabasePortal";

describe("árvore de aplicações", () => {
  it("organiza aplicações e subaplicações a partir dos nós externos", () => {
    const tree = buildApplicationTree([
      { id: "cadastros", node_key: "cadastros", label: "Cadastros", parent_id: null, sort_order: 20 },
      { id: "produtos", node_key: "produtos", label: "Produtos", parent_id: "cadastros", sort_order: 30 },
      { id: "funcionarios", node_key: "funcionarios", label: "Funcionários", parent_id: "cadastros", sort_order: 10 },
    ]);

    expect(tree).toEqual([{ id: "cadastros", key: "cadastros", label: "Cadastros", children: [
      { id: "produtos", key: "produtos", label: "Produtos", children: [] },
      { id: "funcionarios", key: "funcionarios", label: "Funcionários", children: [] },
    ] }]);
  });
});

describe("perfis de acesso", () => {
  it("remove perfis repetidos e aplica a ordem funcional", () => {
    expect(normalizeProfileKeys(["viewer", "operator", "viewer", "operations-admin", "development-admin"])).toEqual(["development-admin", "operations-admin", "operator", "viewer"]);
  });
});
