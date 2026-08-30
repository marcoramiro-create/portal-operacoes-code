import * as XLSX from "xlsx";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { TRPCError } from "@trpc/server";
import { assertApplicationPermission, type PortalIdentity } from "./supabasePortal";
import type { AssetType } from "./assetMaintenance";

let pool: Pool | undefined;
function getPool() {
  if (!pool) pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || "" });
  return pool;
}
const nodeForType = (type: AssetType) => type === "forklift" ? "ativos-empilhadeiras" : type === "industrial_equipment" ? "ativos-equipamentos-industria" : "ativos-ferramentas";
const text = (value: unknown) => String(value ?? "").trim();

export type AssetImportRow = { code: string; name: string; serialNumber?: string; status?: string; criticality?: string; sector?: string; productionLine?: string; physicalPosition?: string; metadata?: Record<string, unknown> };

export function parseAssetWorkbook(contentBase64: string, type: AssetType): { rows: AssetImportRow[]; errors: string[] } {
  const workbook = XLSX.read(Buffer.from(contentBase64, "base64"), { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new TRPCError({ code: "BAD_REQUEST", message: "A planilha não possui uma aba válida." });
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const rows: AssetImportRow[] = [];
  const errors: string[] = [];
  raw.forEach((item, index) => {
    const rowNumber = index + 2;
    const code = text(item.codigo ?? item.code ?? item["Código"]);
    const name = text(item.nome ?? item.name ?? item["Nome"]);
    if (!code || !name) { errors.push(`Linha ${rowNumber}: código e nome são obrigatórios.`); return; }
    rows.push({ code, name, serialNumber: text(item.numero_serie ?? item.serialNumber) || undefined, status: text(item.status) || undefined, criticality: type === "industrial_equipment" ? text(item.criticidade ?? item.criticality) || undefined : undefined, sector: text(item.setor ?? item.sector) || undefined, productionLine: text(item.linha_producao ?? item.productionLine) || undefined, physicalPosition: text(item.posicao_fisica ?? item.physicalPosition) || undefined, metadata: { importedFromRow: rowNumber, assetType: type } });
  });
  return { rows, errors };
}

export async function commitAssetImport(type: AssetType, rows: AssetImportRow[], identity: PortalIdentity) {
  await assertApplicationPermission(identity, nodeForType(type), "manage");
  if (!rows.length || rows.length > 10000) throw new TRPCError({ code: "BAD_REQUEST", message: "A prévia deve conter entre 1 e 10.000 linhas válidas." });
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    let inserted = 0;
    for (const row of rows) {
      const id = randomUUID();
      await client.query(`INSERT INTO assetAssets (id, assetType, code, name, serialNumber, status, criticality, sector, productionLine, physicalPosition, metadata, createdByUserId) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, [id, type, row.code, row.name, row.serialNumber ?? null, row.status ?? "active", row.criticality ?? null, row.sector ?? null, row.productionLine ?? null, row.physicalPosition ?? null, JSON.stringify(row.metadata ?? {}), identity.id]);
      inserted++;
    }
    await client.query("COMMIT");
    return { inserted };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}