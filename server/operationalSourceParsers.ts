import * as XLSX from "xlsx";
import { cleanSourceText, normalizeBranchCode, normalizeInvoiceKey, normalizeProductCode, normalizePurchaseOrderKey, normalizeSupplierKey, parseSourceNumber } from "./operationalNormalization";

export type OperationalIssue = { row: number; field: string; message: string };
export type ParsedSource<T> = { rows: T[]; sourceRows: number; skippedRows: number; issues: OperationalIssue[] };

type RawRow = unknown[];

function normalizeHeader(value: unknown) { return cleanSourceText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase(); }
function readDelimited(content: string): RawRow[] {
  const delimiter = content.split(/\r?\n/, 1)[0].split(";").length >= content.split(/\r?\n/, 1)[0].split(",").length ? ";" : ",";
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < content.length; i += 1) { const c = content[i]; const n = content[i + 1]; if (c === '"' && quoted && n === '"') { cell += '"'; i += 1; continue; } if (c === '"') { quoted = !quoted; continue; } if (c === delimiter && !quoted) { row.push(cell); cell = ""; continue; } if ((c === "\n" || c === "\r") && !quoted) { if (c === "\r" && n === "\n") i += 1; row.push(cell); if (row.some(v => v.trim() !== "")) rows.push(row); row = []; cell = ""; continue; } cell += c; }
  if (cell || row.length) { row.push(cell); if (row.some(v => v.trim() !== "")) rows.push(row); }
  return rows;
}
function readRows(input: Buffer | string, required?: string[]): RawRow[] {
  if (typeof input === "string") return readDelimited(input);
  const workbook = XLSX.read(input, { type: "buffer", cellText: false, cellDates: true });
  const candidates = required?.length ? workbook.SheetNames : [workbook.SheetNames[0]];
  for (const sheetName of candidates) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false });
    if (!required?.length || headerPosition(rows, required) >= 0) return rows;
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false });
}
function headerPosition(rows: RawRow[], required: string[]) { return rows.findIndex(row => required.every(name => row.some(cell => normalizeHeader(cell) === normalizeHeader(name)))); }
function indexMap(headers: RawRow) { return new Map(headers.map((h, i) => [normalizeHeader(h), i])); }
function val(row: RawRow, map: Map<string, number>, aliases: string[]) { for (const alias of aliases) { const i = map.get(normalizeHeader(alias)); if (i !== undefined) return row[i]; } return ""; }
function dateText(value: unknown): string | null { const s = cleanSourceText(value); if (!s) return null; if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`; const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`; const d = value instanceof Date ? value : new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); }
function baseResult<T>(): ParsedSource<T> { return { rows: [], sourceRows: 0, skippedRows: 0, issues: [] }; }

export type PurchaseOrderSourceRow = { branch: string; orderNumber: string; orderItem: string; productCode: string; quantity: number | null; expectedDate: string | null; deliveredDate: string | null; totalValue: number | null; orderDate: string | null; deliveredQuantity: number | null; supplierCode: string; supplierStore: string; warehouse: string; buyer: string; preNote: string; preNoteQuantity: number | null; key: string; };
export function parsePurchaseOrders(input: Buffer | string): ParsedSource<PurchaseOrderSourceRow> {
  const rows = readRows(input); const pos = headerPosition(rows, ["Filial", "Numero PC", "Produto"]); if (pos < 0) throw new Error("Pedidos: cabeçalho não encontrado."); const map = indexMap(rows[pos]); const result = baseResult<PurchaseOrderSourceRow>();
  rows.slice(pos + 1).forEach((row, offset) => { if (!row.some(v => cleanSourceText(v) !== "")) return; result.sourceRows += 1; const branch = normalizeBranchCode(val(row,map,["Filial"])); const number = cleanSourceText(val(row,map,["Numero PC"])); const item = cleanSourceText(val(row,map,["Item"])); const product = normalizeProductCode(val(row,map,["Produto"])); if (!branch || !number || !item || !product) { result.skippedRows += 1; result.issues.push({ row: pos + offset + 2, field: "chave", message: "Pedido sem filial, número, item ou produto." }); return; } result.rows.push({ branch, orderNumber:number, orderItem:item, productCode:product, quantity:parseSourceNumber(val(row,map,["Quantidade"])), expectedDate:dateText(val(row,map,["Prev Entrega"])), deliveredDate:dateText(val(row,map,["Entrega"])), totalValue:parseSourceNumber(val(row,map,["Vlr.Total"])), orderDate:dateText(val(row,map,["DT Emissao"])), deliveredQuantity:parseSourceNumber(val(row,map,["Qtd.Entregue"])), supplierCode:cleanSourceText(val(row,map,["Fornecedor"])), supplierStore:cleanSourceText(val(row,map,["Loja"])), warehouse:cleanSourceText(val(row,map,["Armazem"])), buyer:cleanSourceText(val(row,map,["Usuario"])), preNote:cleanSourceText(val(row,map,["Pre-Notas"])), preNoteQuantity:parseSourceNumber(val(row,map,["Qt.Pre-Nota"])), key:normalizePurchaseOrderKey(branch,number,item) }); }); return result;
}

export type NfLegalSourceRow = { origin: "NF_LEGAL" | "PROTHEUS_NATIVA"; branch: string | null; invoiceNumber: string; series: string; supplierDocument: string; supplierName: string; issuedAt: string | null; preNoteAt: string | null; classifiedAt: string | null; accessKey: string; status: string; totalXml: number | null; totalErp: number | null; key: string; };
export function parseNfLegal(input: Buffer | string, origin: NfLegalSourceRow["origin"]): ParsedSource<NfLegalSourceRow> {
  const required = origin === "NF_LEGAL" ? ["NF", "DT. EMISSÃO", "DT. PRÉ-NOTA"] : ["NÚMERO", "DT. EMISSÃO", "DT. PRÉ-NOTA"];
  const rows = readRows(input, required); const pos = headerPosition(rows, required); if (pos < 0) throw new Error("NF Legal: cabeçalho não encontrado."); const map=indexMap(rows[pos]); const result=baseResult<NfLegalSourceRow>(); rows.slice(pos+1).forEach((row,offset)=>{ if(!row.some(v=>cleanSourceText(v)!==""))return; result.sourceRows+=1; const branch=cleanSourceText(val(row,map,["Filial"]))||null; const invoice=cleanSourceText(val(row,map,["NF","NÚMERO"])); const series=cleanSourceText(val(row,map,["SÉRIE"])); const cnpj=cleanSourceText(val(row,map,["CNPJ"])); if(!invoice){result.skippedRows+=1;result.issues.push({row:pos+offset+2,field:"NF",message:"Registro sem número de NF."});return;} const access=cleanSourceText(val(row,map,["CHAVE"])); result.rows.push({origin,branch,invoiceNumber:invoice,series,supplierDocument:cnpj,supplierName:cleanSourceText(val(row,map,["RAZÃO SOCIAL"])),issuedAt:dateText(val(row,map,["DT. EMISSÃO"])),preNoteAt:dateText(val(row,map,["DT. PRÉ-NOTA"])),classifiedAt:dateText(val(row,map,["DT. CLASSIFICAÇÃO"])),accessKey:access,status:cleanSourceText(val(row,map,["STATUS PROTHEUS"])),totalXml:parseSourceNumber(val(row,map,["VALOR TOTAL XML"])),totalErp:parseSourceNumber(val(row,map,["VALOR TOTAL ERP"])),key:normalizeInvoiceKey(branch,invoice,series,cnpj,access)});}); return result;
}

export type StockEvolutionSourceRow = { company: string; branch: string; productCode: string; aggregateProductCode: string; description: string; unit: string; year: number | null; month: number | null; quantity: number | null; totalValue: number | null; };
export function parseStockEvolution(input: Buffer | string): ParsedSource<StockEvolutionSourceRow> { const rows=readRows(input); const pos=headerPosition(rows,["Empresa","Codigo Item","Ano","Mês"]); if(pos<0)throw new Error("Estoque: cabeçalho não encontrado."); const map=indexMap(rows[pos]); const result=baseResult<StockEvolutionSourceRow>(); rows.slice(pos+1).forEach((row,offset)=>{ if(!row.some(v=>cleanSourceText(v)!==""))return; result.sourceRows+=1; const company=cleanSourceText(val(row,map,["Empresa"])); const product=normalizeProductCode(val(row,map,["Codigo Item"])); if(!company||!product||company.toLowerCase().startsWith("total")){result.skippedRows+=1;return;} const branch=normalizeBranchCode(company); result.rows.push({company,branch,productCode:product,aggregateProductCode:normalizeProductCode(val(row,map,["Codigo Agregado"])),description:cleanSourceText(val(row,map,["Desc.Item"])),unit:cleanSourceText(val(row,map,["Unid.Med."]),),year:parseSourceNumber(val(row,map,["Ano"])),month:parseSourceNumber(val(row,map,["Mês"])),quantity:parseSourceNumber(val(row,map,["Quantidade"])),totalValue:parseSourceNumber(val(row,map,["Valor Total"]))});}); return result; }

export { normalizeSupplierKey };
