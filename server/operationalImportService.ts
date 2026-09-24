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

// REGRA DE NEGÓCIO (24/09/2026): importar cadastro novo NUNCA apaga a versão atual.
// Sobrescreve (upsert) ou mantém histórico (active_from/active_to); sempre vale a mais recente.
// A materialização do SB1 ocorre na MESMA transação do lote/source_rows: se qualquer passo
// falhar, nada fica gravado — "consta importado" somente quando tudo gravou de fato.
// Campos usados (fonte: protheusCatalogParsers.ts — Sb1Row): productCode, aggregateProductCode,
// description, type, family, subfamily, ncm, inclusionDate.
async function materializeSb1(client: PoolClient, batchId: string, rows: CatalogRow[]) {
  for (let i = 0; i < rows.length; i += 1) {
    const x = rows[i] as Sb1Row;
    if (!x.productCode) continue; // linha sem código não vira produto

    const name = x.description || `Produto ${x.productCode}`;
    const productType = x.type || null;
    const metadata = {
      familia: x.family || null,
      subfamilia: x.subfamily || null,
      ncm: x.ncm || "",
      inclusionDate: x.inclusionDate || "",
    };

    // 1) Produto — upsert pela chave única product_code (nunca apaga)
    const product = await client.query<{ id: string }>(
      `insert into public.products
         (product_code, name, product_type, active, metadata, source_batch_id, source_system, source_product_code, updated_at)
       values ($1, $2, $3, true, $4::jsonb, $5, 'SB1', $1, now())
       on conflict (product_code) do update set
         name = excluded.name,
         product_type = excluded.product_type,
         metadata = excluded.metadata,
         source_batch_id = excluded.source_batch_id,
         active = true,
         updated_at = now()
       returning id`,
      [x.productCode, name, productType, asJson(metadata), batchId]
    );
    const productId = product.rows[0].id;

    // 2) Agregado — só se o SB1 indicar código agregado
    if (x.aggregateProductCode) {
      const aggregate = await client.query<{ id: string }>(
        `insert into public.product_aggregates (aggregate_code, name, source_batch_id, source_system, active, updated_at)
         values ($1, $1, $2, 'SB1', true, now())
         on conflict (aggregate_code) do update set name = excluded.name, source_batch_id = excluded.source_batch_id, updated_at = now()
         returning id`,
        [x.aggregateProductCode, batchId]
      );
      const aggregateId = aggregate.rows[0].id;

      // 3) Vínculo com histórico: desativa vínculo ativo anterior de OUTRO agregado
      await client.query(
        `update public.product_aggregate_members set active = false, valid_to = CURRENT_DATE
         where product_id = $1 and active = true and aggregate_id <> $2`,
        [productId, aggregateId]
      );
      await client.query(
        `insert into public.product_aggregate_members (aggregate_id, product_id, source_batch_id, active)
         values ($1, $2, $3, true)
         on conflict (aggregate_id, product_id) do update set active = true, valid_to = null, source_batch_id = excluded.source_batch_id`,
        [aggregateId, productId, batchId]
      );
    } else {
      // Sem agregado nesta versão: desativa vínculo anterior, mantendo histórico (valid_to)
      await client.query(
        `update public.product_aggregate_members set active = false, valid_to = CURRENT_DATE
         where product_id = $1 and active = true`,
        [productId]
      );
    }
  }
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
    // BLOCO 1 (24/09/2026): materializa o cadastro SB1 (products + agregados) na mesma transação.
    // SBZ/SB5/SA2 seguem gravando apenas source_rows — materialização própria virá em bloco futuro.
    if (options.sourceKind === "SB1") {
      await materializeSb1(client, batchId, options.rows);
    }
    await client.query("update public.operational_import_batches set status='processed' where id=$1", [batchId]); await client.query("commit");
    return { batchId, fileHash, rowCount: options.rows.length, status: "processed" as const };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}
async function insertSourceRow(client: PoolClient, batchId: string, rowNumber: number, raw: CatalogRow, mapped: ReturnType<typeof mapRow>) {
  await client.query(`insert into public.operational_source_rows (id,batch_id,source_row_number,company_code,branch_code,product_code,aggregate_product_code,supplier_code,supplier_store,raw_payload,normalized_payload,issue_messages) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,'[]'::jsonb)`, [randomUUID(), batchId, rowNumber, null, "branchCode" in mapped ? mapped.branchCode : null, "productCode" in mapped ? mapped.productCode : null, "aggregateProductCode" in mapped ? mapped.aggregateProductCode : null, "supplierCode" in mapped ? mapped.supplierCode : null, "supplierStore" in mapped ? mapped.supplierStore : null, asJson(raw), asJson(mapped.normalizedPayload)]);
}