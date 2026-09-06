// ============================================================
// server/protheusImport.ts  (REESCRITO)
// Lê a planilha CRUA do Protheus e calcula tudo no portal.
// ============================================================
import * as XLSX from "xlsx";
import { applyAbcClassification, BRANCHES_ACEITAS, BRANCHES_IGNORADAS, calculatePerRow, type CalculatedRow, type RawProtheusRow, type ReferenceData } from "./protheusCalculations";

export type ProtheusInventoryRecord = {
  code: string;
  description: string;
  branch: string;
  productType: "ME" | "PE";
  mrp: "Sim" | "Não";
  family: string;
  subfamily: string;
  curve: "A" | "B" | "C" | "D" | "E";
  sales13M: number;
  salesValue13M: number;
  stock: number;
  stockValue: number;
  coverageDays: number;
  excessValue: number;
};

function asText(value: unknown) { return String(value ?? "").trim(); }
function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = asText(value).replace(/[R$\s]/g, "");
  if (!text) return 0;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  const normalized = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
}

const MONTH_PATTERN = /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\/\d{4}$/i;
const MONTH_ORDER: Record<string, number> = { jan:1, fev:2, mar:3, abr:4, mai:5, jun:6, jul:7, ago:8, set:9, out:10, nov:11, dez:12 };

export function parseProtheusWorkbook(buffer: Buffer, ref: ReferenceData, hoje = new Date()): ProtheusInventoryRecord[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellText: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("A planilha não possui uma aba para importação.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName], { header: 1, raw: false, defval: "" });
  const headerRow = rows[0];
  if (!headerRow) throw new Error("A planilha não possui uma linha de cabeçalhos.");

  const headerPositions = new Map<string, number>();
  headerRow.forEach((header, position) => { const name = asText(header); if (name && !headerPositions.has(name)) headerPositions.set(name, position); });

  const required = ["Codigo", "Descricao", "Filial", "Ultima Compra", "CustoUn13M", "CustoTot13M", "Prazo", "Estoque", "Pedidos"];
  const missing = required.filter(h => !headerPositions.has(h));
  if (missing.length) throw new Error(`A planilha não contém as colunas obrigatórias: ${missing.join(", ")}.`);

  // Detecta as colunas de meses e pega as 13 mais recentes
  const monthHeaders: { name: string; pos: number; sortKey: number }[] = [];
  headerRow.forEach((header, position) => {
    const name = asText(header);
    const m = name.match(MONTH_PATTERN);
    if (m) {
      const month = MONTH_ORDER[m[1].toLowerCase()];
      const year = Number(m[2]);
      monthHeaders.push({ name, pos: position, sortKey: year * 12 + month });
    }
  });
  monthHeaders.sort((a, b) => a.sortKey - b.sortKey);
  const last13 = monthHeaders.slice(-13);
  if (last13.length < 13) throw new Error("A planilha deve conter 13 colunas de meses (ex.: Ago/2025 a Ago/2026).");

  const rawRows: RawProtheusRow[] = [];
  const keys = new Set<string>();
  rows.slice(1).forEach((row, index) => {
    if (!row || !row.some(value => asText(value))) return;
    const line = index + 2;
    const valueOf = (h: string) => row[headerPositions.get(h)!];
    const code = asText(valueOf("Codigo"));
    const branch = asText(valueOf("Filial"));
    if (!code || !branch) throw new Error(`A linha ${line} não possui Codigo ou Filial.`);
    if (BRANCHES_IGNORADAS.has(branch)) return;   // descarta 0105 e 0201
    if (!BRANCHES_ACEITAS.has(branch)) return;      // mantém só as aceitas
    const key = `${code}::${branch}`;
    if (keys.has(key)) throw new Error(`Registro duplicado ${code} na filial ${branch}.`);
    keys.add(key);
    const months = last13.map(m => asNumber(row[m.pos]));
    rawRows.push({
      code,
      description: asText(valueOf("Descricao")),
      branch,
      ultimaCompra: asText(valueOf("Ultima Compra")),
      months,
      custoUn13M: asNumber(valueOf("CustoUn13M")),
      custoTot13M: asNumber(valueOf("CustoTot13M")),
      prazo: asNumber(valueOf("Prazo")),
      estoque: asNumber(valueOf("Estoque")),
      pedidos: asNumber(valueOf("Pedidos")),
    });
  });
  if (rawRows.length === 0) throw new Error("A planilha não contém registros para importação após o descarte das filiais.");

  const calculated = applyAbcClassification(rawRows.map(r => calculatePerRow(r, ref)), hoje);
  if (calculated.length > 25000) throw new Error("A planilha excede o limite de 25.000 registros por importação.");

  return calculated.map(c => ({
    code: c.code,
    description: c.description,
    branch: c.branch,
    productType: c.productType,
    mrp: c.mrp,
    family: c.family,
    subfamily: c.subfamily,
    curve: c.curve,
    sales13M: c.sales13M,
    salesValue13M: c.salesValue13M,
    stock: c.stock,
    stockValue: c.stockValue,
    coverageDays: c.coverageDays,
    excessValue: c.excessValue,
  }));
}