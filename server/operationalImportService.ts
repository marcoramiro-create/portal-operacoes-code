import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { TRPCError } from "@trpc/server";
import { getSupabasePool } from "./supabasePortal";
import type { Sb1Row, Sb5Row, Sa2Row, SbzRow } from "./protheusCatalogParsers";

export type CatalogSourceKind = "SB1" | "SBZ" | "SB5" | "SA2";
export type CatalogRow = Sb1Row | SbzRow | Sb5Row | Sa2Row;

export function calculateFileHash(content: Buffer | string) { return createHash("sha256").update(content).digest("hex"); }
function asJson(value: unknown) { return JSON.stringify(value ?? {}); }
function mapRow(source: CatalogSourceKind, row: CatalogRow) {
  if (source === "SB1") { const x = row as Sb1Row; return { productCode: x.productCode, aggregateProductCode: x.aggregateProductCode, normalizedPayload: x }; }
  if (source === "SBZ") { const x = row as SbzRow; return { branchCode: x.branchCode, productCode: x.productCode, normalizedPayload: x }; }
  if (source === "SB5") { const x = row as Sb5Row; return { productCode: x.productCode, normalizedPayload: x }; }
  const x = row as Sa2Row; return { supplierCode: x.supplierCode, supplierStore: x.store, normalizedPayload: x };
}

export async function importCatalogRows(options: { sourceKind: CatalogSourceKind; fileName: string; content: Buffer | string; rows: CatalogRow[]; pool?: Pool }) {
  const pool = options.pool ?? getSupabasePool(); const client = await pool.connect(); const fileHash = calculateFileHash(options.content);
  try {
    await client.query("begin");
    const duplicate = await client.query<{ id: string }>("select id from public.operational_import_batches where source_kind=$1 and file_hash=$2 limit 1", [options.sourceKind, fileHash]);
    if (duplicate.rows[0]) throw new TRPCError({ code: "CONFLICT", message: `Este arquivo já foi importado para ${options.sourceKind}.` });
    const batchId = randomUUID();
    await client.query("insert into public.operational_import_batches (id,source_kind,file_name,file_hash,status,row_count,metadata) values ($1,$2,$3,$4,'received',$5,$6::jsonb)", [batchId, options.sourceKind, options.fileName, fileHash, options.rows.length, asJson({ parser: "protheusCatalogParsers", preservedRaw: true })]);
    for (let i=0; i<options.rows.length; i+=1) {
      const row = options.rows[i]; const mapped = mapRow(options.sourceKind, row);
      await insertSourceRow(client, batchId, i+1, row, mapped);
    }
    await client.query("update public.operational_import_batches set status='processed' where id=$1", [batchId]); await client.query("commit");
    return { batchId, fileHash, rowCount: options.rows.length, status: "processed" as const };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

async function insertSourceRow(client: PoolClient, batchId: string, rowNumber: number, raw: CatalogRow, mapped: ReturnType<typeof mapRow>) {
  await client.query(`insert into public.operational_source_rows (id,batch_id,source_row_number,company_code,branch_code,product_code,aggregate_product_code,supplier_code,supplier_store,raw_payload,normalized_payload,issue_messages) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,'[]'::jsonb)`, [randomUUID(), batchId, rowNumber, null, "branchCode" in mapped ? mapped.branchCode : null, "productCode" in mapped ? mapped.productCode : null, "aggregateProductCode" in mapped ? mapped.aggregateProductCode : null, "supplierCode" in mapped ? mapped.supplierCode : null, "supplierStore" in mapped ? mapped.supplierStore : null, asJson(raw), asJson(mapped.normalizedPayload)]);
}
