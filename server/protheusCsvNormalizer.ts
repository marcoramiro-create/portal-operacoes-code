export type CsvDelimiter = ";" | "," | "\t";

export type CsvNormalizationIssue = {
  code: "HEADER_NOT_FOUND" | "DUPLICATE_HEADER" | "EMPTY_HEADER" | "INVALID_ROW";
  row?: number;
  message: string;
};

export type NormalizedCsv = {
  delimiter: CsvDelimiter;
  headerRow: number;
  headers: string[];
  rows: Record<string, string>[];
  issues: CsvNormalizationIssue[];
};

function clean(value: string): string {
  return value.replace(/^\uFEFF/, "").replace(/\u00a0/g, " ").trim();
}

function normalizeHeader(value: string): string {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .toUpperCase();
}

function splitCsvLine(line: string, delimiter: CsvDelimiter): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      values.push(clean(current));
      current = "";
    } else {
      current += char;
    }
  }
  values.push(clean(current));
  return values;
}

function chooseDelimiter(line: string): CsvDelimiter {
  const candidates: CsvDelimiter[] = [";", ",", "\t"];
  return candidates.sort((left, right) => line.split(right).length - line.split(left).length)[0];
}

export function normalizeProtheusCsv(content: string, expectedHeaderRow = 3): NormalizedCsv {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const issues: CsvNormalizationIssue[] = [];
  const candidateIndex = Math.max(0, expectedHeaderRow - 1);
  const headerLine = lines[candidateIndex] ?? "";
  if (!headerLine.trim()) {
    issues.push({ code: "HEADER_NOT_FOUND", row: expectedHeaderRow, message: `Cabeçalho não encontrado na linha ${expectedHeaderRow}.` });
    return { delimiter: ";", headerRow: expectedHeaderRow, headers: [], rows: [], issues };
  }

  const delimiter = chooseDelimiter(headerLine);
  const rawHeaders = splitCsvLine(headerLine, delimiter);
  const headers = rawHeaders.map(normalizeHeader);
  const seen = new Set<string>();
  headers.forEach((header, index) => {
    if (!header) issues.push({ code: "EMPTY_HEADER", row: expectedHeaderRow, message: `Coluna ${index + 1} sem nome.` });
    if (header && seen.has(header)) issues.push({ code: "DUPLICATE_HEADER", row: expectedHeaderRow, message: `Coluna duplicada: ${header}.` });
    if (header) seen.add(header);
  });

  const rows: Record<string, string>[] = [];
  for (let index = candidateIndex + 1; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue;
    const values = splitCsvLine(lines[index], delimiter);
    if (values.length > headers.length) {
      issues.push({ code: "INVALID_ROW", row: index + 1, message: `Linha possui ${values.length} valores para ${headers.length} colunas.` });
    }
    const row: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      if (header) row[header] = values[columnIndex] ?? "";
    });
    rows.push(row);
  }

  return { delimiter, headerRow: expectedHeaderRow, headers, rows, issues };
}
