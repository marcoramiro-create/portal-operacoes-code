import { describe, expect, it } from "vitest";
import { canReferenceRegistryNode, validateRegistryHierarchy, type RegistryNode } from "./unifiedRegistryHierarchy";

const base: RegistryNode[] = [
  { id: "c1", kind: "EMPRESA", code: "01", name: "Empresa", active: true },
  { id: "b1", kind: "FILIAL", code: "0101", name: "Filial", parentId: "c1", active: true },
  { id: "w1", kind: "ARMAZEM", code: "01", name: "Armazém", parentId: "b1", active: true },
  { id: "l1", kind: "LOCAL_ESTOQUE", code: "01", name: "Local", parentId: "w1", active: true },
];

describe("unified registry hierarchy", () => {
  it("aceita a cadeia empresa, filial, armazém e local", () => {
    expect(validateRegistryHierarchy(base).valid).toBe(true);
    expect(canReferenceRegistryNode(base, "b1", "FILIAL")).toBe(true);
  });

  it("recusa cadastro operacional sem pai", () => {
    const result = validateRegistryHierarchy([{ id: "w1", kind: "ARMAZEM", code: "01", name: "Armazém", active: true }]);
    expect(result.blockers).toContain("hierarquia_sem_pai_w1");
  });

  it("recusa pai de tipo incorreto e filho ativo de pai inativo", () => {
    const result = validateRegistryHierarchy([
      { id: "c1", kind: "EMPRESA", code: "01", name: "Empresa", active: false },
      { id: "w1", kind: "ARMAZEM", code: "01", name: "Armazém", parentId: "c1", active: true },
    ]);
    expect(result.blockers).toEqual(expect.arrayContaining(["pai_invalido_w1_EMPRESA", "filho_ativo_com_pai_inativo_w1"]));
  });

  it("recusa código duplicado dentro do mesmo tipo", () => {
    const result = validateRegistryHierarchy([
      { id: "c1", kind: "EMPRESA", code: "01", name: "A", active: true },
      { id: "c2", kind: "EMPRESA", code: "01", name: "B", active: true },
    ]);
    expect(result.blockers).toContain("codigo_duplicado_EMPRESA|01");
  });
});
