export type SourceIssue = { row: number; field: string; message: string };

export type ProtheusSupplierRow = {
  codigo_fornecedor: string;
  loja_fornecedor: string;
  cnpj_cpf: string;
  razao_social: string;
  nome_fantasia: string;
  ativo: "SIM";
};

export type ProtheusWarehouseRow = {
  codigo_empresa: string;
  codigo_filial: string;
  codigo: string;
  nome: string;
  ativo: "SIM";
};

export type ParseResult<T> = {
  rows: T[];
  sourceRows: number;
  skippedRows: number;
  issues: SourceIssue[];
};

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function findHeader(headers: string[], aliases: string[]) {
  return headers.findIndex(value => aliases.includes(normalizeHeader(value)));
}

function parseCsv(content: string) {
  const firstLine = content.slice(0, content.indexOf("\n") + 1);
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"' && quoted && next === '"') { value += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { row.push(value.trim()); value = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += char;
  }
  if (value || row.length) { row.push(value.trim()); if (row.some(Boolean)) rows.push(row); }
  return rows;
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseXmlRows(xml: string) {
  const rows: string[][] = [];
  const rowExpression = /<Row\b[^>]*>([\s\S]*?)<\/Row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowExpression.exec(xml))) {
    const cells: string[] = [];
    const cellExpression = /<Cell\b([^>]*)(?:\/>|>([\s\S]*?)<\/Cell>)/g;
    let cellMatch: RegExpExecArray | null;
    let position = 1;
    while ((cellMatch = cellExpression.exec(rowMatch[1]))) {
      const indexed = cellMatch[1].match(/(?:ss:)?Index="(\d+)"/);
      if (indexed) position = Number(indexed[1]);
      cells[position - 1] = decodeXml(cellMatch[2] ?? "");
      position += 1;
    }
    rows.push(cells);
  }
  return rows;
}

function requireHeaders(headers: string[], required: Array<{ field: string; aliases: string[] }>) {
  const missing = required.filter(item => findHeader(headers, item.aliases) < 0);
  if (missing.length) throw new Error(`O arquivo não possui os cabeçalhos esperados: ${missing.map(item => item.field).join(", ")}.`);
}

export function parseMata020Csv(content: string): ParseResult<ProtheusSupplierRow> {
  const allRows = parseCsv(content);
  const headerPosition = allRows.findIndex(row => (
    findHeader(row, ["codigo", "codigofornecedor"]) >= 0
    && findHeader(row, ["loja", "lojafornecedor"]) >= 0
    && findHeader(row, ["razaosocial", "razaosocialfornecedor"]) >= 0
  ));
  if (headerPosition < 0) throw new Error("O arquivo CSV não possui os cabeçalhos Código, Loja e Razão Social esperados na exportação MATA020.");
  const headers = allRows[headerPosition];
  const dataRows = allRows.slice(headerPosition + 1);
  requireHeaders(headers, [
    { field: "Código", aliases: ["codigo", "codigofornecedor"] },
    { field: "Loja", aliases: ["loja", "lojafornecedor"] },
    { field: "Razão Social", aliases: ["razaosocial", "razaosocialfornecedor"] },
  ]);
  const codeIndex = findHeader(headers, ["codigo", "codigofornecedor"]);
  const storeIndex = findHeader(headers, ["loja", "lojafornecedor"]);
  const legalNameIndex = findHeader(headers, ["razaosocial", "razaosocialfornecedor"]);
  const documentIndex = findHeader(headers, ["cnpjcpf", "cnpj", "cpf"]);
  const tradeNameIndex = findHeader(headers, ["nfantasia", "nomefantasia"]);
  const result: ParseResult<ProtheusSupplierRow> = { rows: [], sourceRows: 0, skippedRows: 0, issues: [] };
  for (let offset = 0; offset < dataRows.length; offset += 1) {
    const row = dataRows[offset];
    if (!row.some(Boolean)) continue;
    result.sourceRows += 1;
    const code = row[codeIndex]?.trim() ?? "";
    const store = row[storeIndex]?.trim() ?? "";
    const legalName = row[legalNameIndex]?.trim() ?? "";
    if (!code || !store || !legalName) {
      result.skippedRows += 1;
      const sourceRow = headerPosition + offset + 2;
      if (!code) result.issues.push({ row: sourceRow, field: "Código", message: "Fornecedor sem código." });
      if (!store) result.issues.push({ row: sourceRow, field: "Loja", message: "Fornecedor sem loja." });
      if (!legalName) result.issues.push({ row: sourceRow, field: "Razão social", message: "Fornecedor sem razão social." });
      continue;
    }
    result.rows.push({ codigo_fornecedor: code, loja_fornecedor: store, cnpj_cpf: documentIndex >= 0 ? (row[documentIndex]?.trim() ?? "") : "", razao_social: legalName, nome_fantasia: tradeNameIndex >= 0 ? (row[tradeNameIndex]?.trim() ?? "") : "", ativo: "SIM" });
  }
  return result;
}

export function parseAgra045Xml(xml: string): ParseResult<ProtheusWarehouseRow> {
  const worksheetName = xml.match(/<Worksheet\b[^>]*(?:ss:)?Name="([^"]+)"[^>]*>/)?.[1] ?? "";
  const worksheetReference = worksheetName.match(/^\s*([^-\s]+)\s*-\s*([^-\s]+)\s*-/);
  if (!worksheetReference) throw new Error("Não foi possível identificar empresa e filial no nome da planilha do AGRA045.");
  const [, companyCode, branchCode] = worksheetReference;
  const allRows = parseXmlRows(xml);
  const headerPosition = allRows.findIndex(row => findHeader(row, ["codigo", "codigolocal"]) >= 0 && findHeader(row, ["descricao", "descricaolocal"]) >= 0);
  if (headerPosition < 0) throw new Error("O arquivo não possui os cabeçalhos Código e Descrição esperados na exportação AGRA045.");
  const headers = allRows[headerPosition];
  requireHeaders(headers, [{ field: "Código", aliases: ["codigo", "codigolocal"] }, { field: "Descrição", aliases: ["descricao", "descricaolocal"] }]);
  const codeIndex = findHeader(headers, ["codigo", "codigolocal"]);
  const descriptionIndex = findHeader(headers, ["descricao", "descricaolocal"]);
  const result: ParseResult<ProtheusWarehouseRow> = { rows: [], sourceRows: 0, skippedRows: 0, issues: [] };
  const dataRows = allRows.slice(headerPosition + 1);
  for (let offset = 0; offset < dataRows.length; offset += 1) {
    const row = dataRows[offset];
    if (!row.some(Boolean)) continue;
    result.sourceRows += 1;
    const code = row[codeIndex]?.trim() ?? "";
    const description = row[descriptionIndex]?.trim() ?? "";
    if (!code || !description) {
      result.skippedRows += 1;
      const sourceRow = headerPosition + offset + 2;
      if (!code) result.issues.push({ row: sourceRow, field: "Código", message: "Local de estoque sem código." });
      if (!description) result.issues.push({ row: sourceRow, field: "Descrição", message: "Local de estoque sem descrição." });
      continue;
    }
    result.rows.push({ codigo_empresa: companyCode.trim(), codigo_filial: branchCode.trim(), codigo: code, nome: description, ativo: "SIM" });
  }
  return result;
}
