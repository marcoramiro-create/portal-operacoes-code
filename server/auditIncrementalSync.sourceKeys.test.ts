import { describe, expect, it } from "vitest";
import { duplicateFindings } from "./auditIncrementalSync";

describe("auditIncrementalSync source keys", () => {
  it("preserves the original SB1 code key including suffixes", () => {
    const findings = duplicateFindings("SB1", new Map([["100000044835-MGT", 2]]));
    expect(findings[0]).toMatchObject({ source: "SB1", sourceKey: "100000044835-MGT", scope: "SB1.Codigo" });
  });
  it("keeps SA2 and NF Legal document scopes independent", () => {
    expect(duplicateFindings("SA2", new Map([["12345678000190", 2]]))[0]).toMatchObject({ source: "SA2", scope: "SA2.Documento" });
    expect(duplicateFindings("NF_LEGAL", new Map([["0101|NF|1|FORN", 2]]))[0]).toMatchObject({ source: "NF_LEGAL", scope: "NF_LEGAL.Documento" });
  });
});
