export type Mata020SupplierRow = {
  codigo_fornecedor: string;
  loja_fornecedor: string;
  cnpj_cpf: string;
  razao_social: string;
  nome_fantasia: string;
  ativo: "SIM";
};

export type Mata020ParseResult = {
  rows: Mata020SupplierRow[];
  sourceRows: number;
  skippedRows: number;
  issues: Array<{ row: number; field: string; message: string }>;
};

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

function cellsFromRow(row: string) {
  const cells: string[] = [];
  const expression = /<Cell\b([^>]*)(?:\/>|>([\s\S]*?)<\/Cell>)/g;
  let match: RegExpExecArray | null;
  let position = 1;
  while ((match = expression.exec(row))) {
    const index = match[1].match(/(?:ss:)?Index="(\d+)"/);
    if (index) position = Number(index[1]);
    cells[position - 1] = decodeXml(match[2] ?? "");
    position += 1;
  }
  return cells;
}

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function headerIndex(headers: string[], options: string[]) {
  return headers.findIndex(value => options.includes(normalizeHeader(value)));
}

export function parseMata020Xml(xml: string): Mata020ParseResult {
  const rowExpression = /<Row\b[^>]*>([\s\S]*?)<\/Row>/g;
  let match: RegExpExecArray | null;
  let rowNumber = 0;
  let header: string[] | null = null;
  let sourceRows = 0;
  let skippedRows = 0;
  const rows: Mata020SupplierRow[] = [];
  const issues: Mata020ParseResult["issues"] = [];

  while ((match = rowExpression.exec(xml))) {
    rowNumber += 1;
    const cells = cellsFromRow(match[1]);
    if (!header) {
      const code = headerIndex(cells, ["codigo", "codigofornecedor"]);
      const store = headerIndex(cells, ["loja", "lojafornecedor"]);
      const legalName = headerIndex(cells, ["razaosocial", "razaosocialfornecedor"]);
      if (code >= 0 && store >= 0 && legalName >= 0) header = cells;
      continue;
    }

    if (!cells.some(Boolean)) continue;
    if (headerIndex(cells, ["codigo", "codigofornecedor"]) >= 0 && headerIndex(cells, ["loja", "lojafornecedor"]) >= 0 && headerIndex(cells, ["razaosocial", "razaosocialfornecedor"]) >= 0) continue;
    sourceRows += 1;
    const code = cells[headerIndex(header, ["codigo", "codigofornecedor"])]?.trim() ?? "";
    const store = cells[headerIndex(header, ["loja", "lojafornecedor"])]?.trim() ?? "";
    const legalName = cells[headerIndex(header, ["razaosocial", "razaosocialfornecedor"])]?.trim() ?? "";
    const documentNumber = cells[headerIndex(header, ["cnpjcpf", "cnpj", "cpf"])]?.trim() ?? "";
    const tradeName = cells[headerIndex(header, ["nfantasia", "nomefantasia"])]?.trim() ?? "";
    if (!code && !store && !legalName) continue;
    if (!code || !store || !legalName) {
      skippedRows += 1;
      if (!code) issues.push({ row: rowNumber, field: "Código", message: "Fornecedor sem código." });
      if (!store) issues.push({ row: rowNumber, field: "Loja", message: "Fornecedor sem loja." });
      if (!legalName) issues.push({ row: rowNumber, field: "Razão social", message: "Fornecedor sem razão social." });
      continue;
    }
    rows.push({ codigo_fornecedor: code, loja_fornecedor: store, cnpj_cpf: documentNumber, razao_social: legalName, nome_fantasia: tradeName, ativo: "SIM" });
  }

  if (!header) throw new Error("O arquivo não possui os cabeçalhos Código, Loja e Razão Social esperados na exportação MATA020.");
  return { rows, sourceRows, skippedRows, issues };
}
