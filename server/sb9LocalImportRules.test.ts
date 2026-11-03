import { describe, expect, it } from "vitest";
import {
  assertApprovedSb9ReducedFile,
  assertCompleteSb9RowCount,
  assertExpectedSb9Structure,
  assertNoSkippedSb9Rows,
  EXPECTED_SB9_BRANCH_0105_ROWS,
  EXPECTED_SB9_DISTINCT_PRODUCTS,
  EXPECTED_SB9_MONTHS,
  EXPECTED_SB9_NONEMPTY_UNIT_COSTS,
  EXPECTED_SB9_REDUCED_PATH,
  EXPECTED_SB9_SIZE_BYTES,
  EXPECTED_SB9_VALID_ROWS,
} from "./sb9LocalImportRules";

describe("sb9LocalImportRules", () => {
  it("aceita somente o CSV reduzido completo sem sufixo, no tamanho documentado", () => {
    expect(assertApprovedSb9ReducedFile(EXPECTED_SB9_REDUCED_PATH, EXPECTED_SB9_SIZE_BYTES)).toBe(
      EXPECTED_SB9_REDUCED_PATH,
    );
  });

  it.each([
    "/home/ubuntu/sb9-processor/saida/SB9_REDUZIDA_202610262105_1.csv",
    "/home/ubuntu/sb9-processor/saida/SB9_REDUZIDA_202610262105_2.csv",
    "/tmp/SB9_REDUZIDA_202610262105.csv",
    "/home/ubuntu/sb9-processor/saida/SB9 - 202610262105.csv",
  ])("recusa fonte incorreta ou versão com sufixo: %s", filePath => {
    expect(() => assertApprovedSb9ReducedFile(filePath, EXPECTED_SB9_SIZE_BYTES)).toThrow(
      /somente .* é autorizada/,
    );
  });

  it("recusa tamanho divergente mesmo no caminho aprovado", () => {
    expect(() => assertApprovedSb9ReducedFile(EXPECTED_SB9_REDUCED_PATH, EXPECTED_SB9_SIZE_BYTES - 1)).toThrow(
      /tamanho .* bytes/,
    );
  });

  it("aceita somente o total exato de linhas válidas documentado", () => {
    expect(() => assertCompleteSb9RowCount(EXPECTED_SB9_VALID_ROWS)).not.toThrow();
    expect(() => assertCompleteSb9RowCount(EXPECTED_SB9_VALID_ROWS - 1)).toThrow(/Importação cancelada/);
  });

  it("recusa qualquer linha inválida", () => {
    expect(() => assertNoSkippedSb9Rows(0)).not.toThrow();
    expect(() => assertNoSkippedSb9Rows(1)).toThrow(/linhas SB9 inválidas/);
  });

  it("exige filial 0105, produtos, meses e custos não vazios conforme inventário", () => {
    const exact = {
      validRows: EXPECTED_SB9_VALID_ROWS,
      rowsInBranch0105: EXPECTED_SB9_BRANCH_0105_ROWS,
      distinctProducts: EXPECTED_SB9_DISTINCT_PRODUCTS,
      distinctMonths: EXPECTED_SB9_MONTHS,
      nonemptyUnitCosts: EXPECTED_SB9_NONEMPTY_UNIT_COSTS,
    };
    expect(() => assertExpectedSb9Structure(exact)).not.toThrow();
    expect(() => assertExpectedSb9Structure({ ...exact, distinctProducts: exact.distinctProducts - 1 })).toThrow(
      /distinctProducts/,
    );
  });
});
