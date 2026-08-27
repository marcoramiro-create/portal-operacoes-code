import * as XLSX from "xlsx";

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

const requiredHeaders = ["Codigo", "Descricao", "Filial", "Tipo", "Qtd13M", "CustoTot13M", "Estoque", "Total R$", "Classe ABC", "Cobertura (Dias)", "Excedente (R$)", "Família", "SubFamília"] as const;
const allowedCurves = new Set<ProtheusInventoryRecord["curve"]>(["A", "B", "C", "D", "E"]);
const allowedBranches = new Set(["0101", "0102", "0301", "0303"]);
const allowedProductTypes = new Set<ProtheusInventoryRecord["productType"]>(["ME", "PE"]);

function asText(value: unknown) { return String(value ?? "").trim(); }

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = asText(value).replace(/[R$\s]/g, "");
  if (!text) return 0;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  const normalized = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  const result = Number(normalized);
  if (!Number.isFinite(result)) throw new Error(`Valor numérico inválido: ${asText(value)}`);
  return result;
}

export function parseProtheusWorkbook(buffer: Buffer): ProtheusInventoryRecord[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellText: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("A planilha não possui uma aba para importação.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName], { header: 1, raw: false, defval: "" });
  const headerRow = rows[0];
  if (!headerRow) throw new Error("A planilha não possui uma linha de cabeçalhos.");

  const headerPositions = new Map<string, number>();
  headerRow.forEach((header, position) => { const name = asText(header); if (name && !headerPositions.has(name)) headerPositions.set(name, position); });
  const missingHeaders = requiredHeaders.filter(header => !headerPositions.has(header));
  if (missingHeaders.length > 0) throw new Error(`A planilha não contém as colunas obrigatórias: ${missingHeaders.join(", ")}.`);

  const records: ProtheusInventoryRecord[] = [];
  const recordKeys = new Set<string>();
  rows.slice(1).forEach((row, index) => {
    if (!row.some(value => asText(value))) return;
    const line = index + 2;
    const valueOf = (header: string) => row[headerPositions.get(header)!];
    const code = asText(valueOf("Codigo"));
    const description = asText(valueOf("Descricao"));
    const branch = asText(valueOf("Filial"));
    const productType = asText(valueOf("Tipo")).toUpperCase() as ProtheusInventoryRecord["productType"];
    const rawMrp = asText(headerPositions.has("MRP") ? valueOf("MRP") : "").toUpperCase();
    if (rawMrp && rawMrp !== "SIM" && rawMrp !== "NÃO" && rawMrp !== "NAO") throw new Error(`A linha ${line} possui MRP inválido; use Sim ou Não.`);
    const mrp: ProtheusInventoryRecord["mrp"] = rawMrp === "SIM" ? "Sim" : "Não";
    const curve = asText(valueOf("Classe ABC")).toUpperCase() as ProtheusInventoryRecord["curve"];
    if (!code || !description || !branch || !allowedCurves.has(curve)) throw new Error(`A linha ${line} não possui Codigo, Descricao, Filial ou Classe ABCDE válidos.`);
    if (!allowedProductTypes.has(productType)) throw new Error(`A linha ${line} possui Tipo de produto inválido.`);
    if (!allowedBranches.has(branch)) return;
    const recordKey = `${code}::${branch}`;
    if (recordKeys.has(recordKey)) throw new Error(`A planilha possui o registro duplicado ${code} na filial ${branch}.`);
    recordKeys.add(recordKey);

    records.push({
      code,
      description,
      branch,
      productType,
      mrp,
      family: asText(valueOf("Família")),
      subfamily: asText(valueOf("SubFamília")),
      curve,
      sales13M: asNumber(valueOf("Qtd13M")),
      salesValue13M: asNumber(valueOf("CustoTot13M")),
      stock: asNumber(valueOf("Estoque")),
      stockValue: asNumber(valueOf("Total R$")),
      coverageDays: asNumber(valueOf("Cobertura (Dias)")),
      excessValue: asNumber(valueOf("Excedente (R$)")),
    });
  });
  if (records.length === 0) throw new Error("A planilha não contém registros para importação.");
  if (records.length > 25000) throw new Error("A planilha excede o limite de 25.000 registros por importação.");
  return records;
}
