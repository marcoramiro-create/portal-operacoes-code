import { describe, expect, it } from "vitest";
import { incrementalFingerprint } from "./auditIncrementalSync";

describe("auditIncrementalSync reprocessamento", () => {
  it("mantém a mesma chave quando apenas o detalhe muda", () => {
    const first = { category: "EXCECAO" as const, kind: "X", scope: null, source: "SBZ", sourceKey: "0101|001", detail: "detalhe inicial" };
    const second = { ...first, detail: "detalhe atualizado" };
    expect(incrementalFingerprint(first)).toBe(incrementalFingerprint(second));
  });
});
