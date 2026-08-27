import { readFile } from "node:fs/promises";
import { parseAgra045Xml, parseMata020 } from "../server/protheusRegistrationParsers";

const [supplierPath, locationPath] = process.argv.slice(2);
if (!supplierPath || !locationPath) throw new Error("Informe os caminhos do arquivo MATA020 (CSV ou XML) e XML AGRA045.");

function countDuplicates(values: string[]) {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return repeated.size;
}

const [supplierContent, locationContent] = await Promise.all([
  readFile(supplierPath, "utf8"),
  readFile(locationPath, "utf8"),
]);
const suppliers = parseMata020(supplierContent);
const locations = parseAgra045Xml(locationContent);

console.log(JSON.stringify({
  suppliers: {
    sourceRows: suppliers.sourceRows,
    acceptedRows: suppliers.rows.length,
    skippedRows: suppliers.skippedRows,
    issueCount: suppliers.issues.length,
    duplicateCodeStoreKeys: countDuplicates(suppliers.rows.map(row => `${row.codigo_fornecedor}::${row.loja_fornecedor}`)),
  },
  warehouses: {
    sourceRows: locations.sourceRows,
    acceptedRows: locations.rows.length,
    skippedRows: locations.skippedRows,
    issueCount: locations.issues.length,
    sourceCompanyCodes: [...new Set(locations.rows.map(row => row.codigo_empresa))],
    sourceBranchCodes: [...new Set(locations.rows.map(row => row.codigo_filial))],
    duplicateCodes: countDuplicates(locations.rows.map(row => `${row.codigo_empresa}::${row.codigo_filial}::${row.codigo}`)),
  },
}, null, 2));
