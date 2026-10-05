import * as XLSX from "xlsx";
import { classifyOperation, cleanSourceText, normalizeBranchCode } from "./operationalNormalization";

export type OperationMapRow = { warehouseCode: string; companyCode: string; branchCode: string; uf: string; department: string; operation: "AUTOPECAS" | "SERVICOS" | "INDUSTRIA" | "IMPLEMENTOS" };
export type OperationMapIssue = { row: number; field: string; message: string };
export type OperationMapParseResult = { rows: OperationMapRow[]; sourceRows: number; skippedRows: number; duplicateRows: number; issues: OperationMapIssue[] };
function normalized(value: unknown) { return cleanSourceText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase(); }
function value(row: unknown[], map: Map<string, number>, ...aliases: string[]) { for (const alias of aliases) { const index = map.get(normalized(alias)); if (index !== undefined) return cleanSourceText(row[index]); } return ""; }
export function parseOperationMap(content: Buffer | string): OperationMapParseResult {
  const workbook = XLSX.read(content, { type: typeof content === "string" ? "string" : "buffer", cellText: true, raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]]; const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
  const header = raw.findIndex(row => ["Armazem", "Empresa", "UF", "DEPTO"].every(field => row.some(cell => normalized(cell) === normalized(field))));
  if (header < 0) throw new Error("Mapa de operações: cabeçalho Armazem, Empresa, UF e DEPTO não encontrado.");
  const map = new Map(raw[header].map((cell, index) => [normalized(cell), index])); const result: OperationMapParseResult = { rows: [], sourceRows: 0, skippedRows: 0, duplicateRows: 0, issues: [] }; const seen = new Set<string>();
  raw.slice(header + 1).forEach((row, offset) => { if (!row.some(cell => cleanSourceText(cell))) return; result.sourceRows += 1; const warehouseCode=value(row,map,"Armazem"); const companyCode=value(row,map,"Empresa"); const branchCode=normalizeBranchCode(value(row,map,"Empresa")); const uf=value(row,map,"UF"); const department=value(row,map,"DEPTO"); const operation=classifyOperation({ branch: branchCode, uf, department }); const sourceRow=header+offset+2; if (!warehouseCode || !companyCode || !department || !operation) { result.skippedRows += 1; result.issues.push({ row: sourceRow, field: "classificação", message: "Vínculo sem armazém, empresa/departamento ou operação classificável." }); return; } const key=`${warehouseCode}|${companyCode}|${department}`; if (seen.has(key)) { result.duplicateRows += 1; result.issues.push({ row: sourceRow, field: "chave", message: `Vínculo duplicado: ${key}.` }); return; } seen.add(key); result.rows.push({ warehouseCode, companyCode, branchCode, uf, department, operation }); }); return result;
}
