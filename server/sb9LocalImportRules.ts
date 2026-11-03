import path from "node:path";

export const EXPECTED_SB9_REDUCED_PATH =
  "/home/ubuntu/sb9-processor/saida/SB9_REDUZIDA_202610262105.csv";
export const EXPECTED_SB9_SIZE_BYTES = 76_148_125;
export const EXPECTED_SB9_VALID_ROWS = 1_478_403;
export const EXPECTED_SB9_BRANCH_0105_ROWS = 428_907;
export const EXPECTED_SB9_DISTINCT_PRODUCTS = 41_839;
export const EXPECTED_SB9_MONTHS = 21;

export function assertApprovedSb9ReducedFile(filePath: string, sizeBytes: number) {
  const resolved = path.resolve(filePath);
  if (resolved !== EXPECTED_SB9_REDUCED_PATH) {
    throw new Error(
      `Importação bloqueada: somente ${EXPECTED_SB9_REDUCED_PATH} é autorizada; arquivos _1/_2 e outras fontes não serão usados.`,
    );
  }
  if (path.basename(resolved) !== "SB9_REDUZIDA_202610262105.csv") {
    throw new Error("Importação bloqueada: nome não corresponde à SB9 reduzida aprovada.");
  }
  if (sizeBytes !== EXPECTED_SB9_SIZE_BYTES) {
    throw new Error(
      `Importação bloqueada: tamanho ${sizeBytes} bytes; o arquivo reduzido completo documentado tem ${EXPECTED_SB9_SIZE_BYTES} bytes.`,
    );
  }
  return resolved;
}

export function assertCompleteSb9RowCount(validRows: number) {
  if (!Number.isInteger(validRows) || validRows !== EXPECTED_SB9_VALID_ROWS) {
    throw new Error(
      `Importação cancelada: foram lidas ${validRows} linhas válidas; o arquivo completo documentado deve ter exatamente ${EXPECTED_SB9_VALID_ROWS}. O lote não será publicado como processed.`,
    );
  }
}

export function assertNoSkippedSb9Rows(skippedRows: number) {
  if (skippedRows !== 0) {
    throw new Error(
      `Importação cancelada: o parser encontrou ${skippedRows} linhas SB9 inválidas. Nenhuma carga incompleta será publicada como processed.`,
    );
  }
}

export function assertExpectedSb9Structure(input: {
  validRows: number;
  rowsInBranch0105: number;
  distinctProducts: number;
  distinctMonths: number;
}) {
  const expected = {
    validRows: EXPECTED_SB9_VALID_ROWS,
    rowsInBranch0105: EXPECTED_SB9_BRANCH_0105_ROWS,
    distinctProducts: EXPECTED_SB9_DISTINCT_PRODUCTS,
    distinctMonths: EXPECTED_SB9_MONTHS,
  };
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (input[key] !== expected[key]) {
      throw new Error(
        `Importação cancelada: ${key}=${input[key]}, esperado ${expected[key]} conforme a assinatura documentada da SB9 completa.`,
      );
    }
  }
}
