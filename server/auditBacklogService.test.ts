import { describe, expect, it } from "vitest";
import { findingFingerprint, findingsFromReport } from "./auditBacklogService";

describe("auditBacklogService", () => {
  it("mantém fingerprint estável quando apenas o detalhe muda", () => {
    const a = { category: "EXCECAO" as const, kind: "PRODUTO_NAO_ENCONTRADO_SB1", scope: null, source: "SBZ", sourceKey: "0101|00566", detail: "detalhe 1" };
    const b = { ...a, detail: "detalhe 2" };
    expect(findingFingerprint(a)).toBe(findingFingerprint(b));
  });

  it("separa exceções e duplicidades em findings", () => {
    const findings = findingsFromReport({
      exceptions: [{ kind: "PRODUTO_NAO_ENCONTRADO_SB1", source: "SBZ", sourceKey: "0101|00566", detail: "não encontrado" }],
      duplicates: [{ scope: "NF_LEGAL.Documento", key: "0101|10|1|FORN|PROD", occurrences: 2 }],
    });
    expect(findings).toHaveLength(2);
    expect(findings[0].category).toBe("EXCECAO");
    expect(findings[1]).toMatchObject({ category: "DUPLICIDADE", source: "NF_LEGAL", scope: "NF_LEGAL.Documento" });
  });

  it("não usa o detalhe variável na chave", () => {
    const first = { category: "DUPLICIDADE" as const, kind: "CHAVE_DUPLICADA", scope: "SB1.Codigo", source: "SB1", sourceKey: "00566", detail: "2 ocorrências" };
    const second = { ...first, detail: "3 ocorrências" };
    expect(findingFingerprint(first)).toBe(findingFingerprint(second));
  });
});
