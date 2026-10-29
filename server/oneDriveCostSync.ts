import { createHash, randomUUID } from "node:crypto";
import type { Request } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { listOneDriveFiles, streamOneDriveContent } from "./oneDriveOAuth";
import { createSb9StreamParser, type Sb9Row } from "./protheusCatalogParsers";
import { parseSourceNumber } from "./operationalNormalization";
import { selectReferenceFile } from "./oneDriveReferenceRules";
import { ENV } from "./_core/env";

type SyncResult = {
  kind: "SB9";
  fileName: string;
  status: "Atualizada" | "Sem alteração";
  count: number;
  updatedAt: string;
};

const ALLOWED_FOLDERS = new Set([
  "Documents/Documentos/Portal de Operações/Cadastros",
  "Documentos/Portal de Operações/Cadastros",
]);

function numeric(value: string) {
  return parseSourceNumber(value);
}

function rawPayload(row: Sb9Row) {
  return {
    filial: row.branchCode,
    produto: row.productCode,
    armazem: row.warehouseCode,
    dataSaldo: row.balanceDate,
    qtdInicialMes: row.initialQuantity,
    saldoInicialMes: row.initialBalance,
    grupo: row.groupCode,
    codigoProdutoAuditoria: row.auditProductCode,
    custoStandard: row.standardCost,
    custoUnitario1aM: row.unitCost1aM,
  };
}

function normalizedPayload(row: Sb9Row) {
  return {
    branchCode: row.branchCode,
    productCode: row.productCode,
    warehouseCode: row.warehouseCode,
    balanceDate: row.balanceDateIso,
    initialQuantity: numeric(row.initialQuantity),
    initialBalance: numeric(row.initialBalance),
    groupCode: row.groupCode,
    auditProductCode: row.auditProductCode,
    standardCost: numeric(row.standardCost),
    unitCost1aM: row.unitCost1aMValue,
  };
}

async function insertRows(tx: any, batchId: string, rows: Array<{ sourceRowNumber: number; row: Sb9Row }>) {
  if (!rows.length) return;
  const values = sql.join(rows.map(({ sourceRowNumber, row }) => sql`(
    ${batchId}::uuid,
    ${sourceRowNumber},
    null,
    ${row.branchCode},
    ${row.warehouseCode || null},
    ${row.productCode},
    null,
    ${row.balanceDateIso}::date,
    ${numeric(row.initialQuantity)},
    ${row.unitCost1aMValue},
    null,
    ${JSON.stringify(rawPayload(row))}::jsonb,
    ${JSON.stringify(normalizedPayload(row))}::jsonb,
    '[]'::jsonb
  )`), sql`, `);
  await tx.execute(sql`
    insert into public.operational_source_rows
      (batch_id, source_row_number, operation, branch_code, warehouse_code,
       product_code, aggregate_product_code, event_date, quantity, unit_value,
       total_value, raw_payload, normalized_payload, issue_messages)
    values ${values}
    on conflict (batch_id, source_row_number) do update set
      branch_code = excluded.branch_code,
      warehouse_code = excluded.warehouse_code,
      product_code = excluded.product_code,
      event_date = excluded.event_date,
      quantity = excluded.quantity,
      unit_value = excluded.unit_value,
      raw_payload = excluded.raw_payload,
      normalized_payload = excluded.normalized_payload,
      issue_messages = excluded.issue_messages
  `);
}

export async function syncOneDriveSb9(req: Request): Promise<SyncResult> {
  if (process.cwd() !== "/home/ubuntu/portal-operacoes-homolog" || !ALLOWED_FOLDERS.has(ENV.onedriveFolderPath)) {
    throw new Error("Atualização SB9 bloqueada: diretório ou pasta não corresponde à Homologação autorizada.");
  }
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const check = await db.execute(sql`select current_database() as name`);
  if (check.rows[0]?.name !== "portal_operacoes") {
    throw new Error("Atualização SB9 bloqueada: banco não corresponde à Homologação.");
  }

  const listing = await listOneDriveFiles(req);
  if (!listing.connected) throw new Error("Conecte o OneDrive antes de atualizar a SB9.");
  const file = selectReferenceFile(listing.files, "SB9");
  const previous = await db.execute(sql`
    select item_id, file_hash, modified_at, row_count
    from public.portal_onedrive_reference_state
    where kind = 'SB9'
  `);
  const prior = previous.rows[0];
  const unchanged = prior
    && String(prior.item_id) === file.id
    && new Date(String(prior.modified_at)).getTime() === new Date(file.modifiedAt).getTime();
  if (unchanged) {
    return {
      kind: "SB9",
      fileName: file.name,
      status: "Sem alteração",
      count: Number(prior.row_count ?? 0),
      updatedAt: String(prior.modified_at),
    };
  }

  const result = await db.transaction(async (tx: any) => {
    await tx.execute(sql`select pg_advisory_xact_lock(714049)`);
    const batchId = randomUUID();
    const pendingHash = `pending:${batchId}`;
    await tx.execute(sql`
      insert into public.operational_import_batches
        (id, source_kind, file_name, file_hash, status, row_count, metadata)
      values
        (${batchId}::uuid, 'SB9', ${file.name}, ${pendingHash}, 'received', 0,
         ${JSON.stringify({ parser: "protheusCatalogParsers.createSb9StreamParser", source: "OneDrive", mode: "streaming" })}::jsonb)
    `);

    const digest = createHash("sha256");
    const parserRows: Array<{ sourceRowNumber: number; row: Sb9Row }> = [];
    let validRows = 0;
    let sourceRowNumber = 0;
    const parser = createSb9StreamParser(row => {
      validRows += 1;
      sourceRowNumber += 1;
      parserRows.push({ sourceRowNumber, row });
    });
    const flush = async () => {
      if (!parserRows.length) return;
      const rows = parserRows.splice(0, parserRows.length);
      await insertRows(tx, batchId, rows);
    };

    for await (const chunk of streamOneDriveContent(req, file.id)) {
      digest.update(chunk);
      parser.push(chunk);
      if (parserRows.length >= 500) await flush();
    }
    const parsed = parser.finish();
    await flush();
    if (!validRows) throw new Error("SB9: nenhum registro válido encontrado. A base anterior foi preservada.");

    const fileHash = digest.digest("hex");
    await tx.execute(sql`
      update public.operational_import_batches
      set file_hash = ${fileHash}, status = 'processed', row_count = ${validRows},
          metadata = metadata || ${JSON.stringify({ sourceRows: parsed.sourceRows, skippedRows: parsed.skippedRows, issueCount: parsed.issues.length })}::jsonb
      where id = ${batchId}::uuid
    `);
    await tx.execute(sql`
      insert into public.portal_onedrive_reference_state
        (kind, item_id, file_name, file_hash, modified_at, row_count, updated_at)
      values
        ('SB9', ${file.id}, ${file.name}, ${fileHash}, ${file.modifiedAt}::timestamptz, ${validRows}, now())
      on conflict (kind) do update set
        item_id = excluded.item_id,
        file_name = excluded.file_name,
        file_hash = excluded.file_hash,
        modified_at = excluded.modified_at,
        row_count = excluded.row_count,
        updated_at = now()
    `);
    return { count: validRows, updatedAt: new Date().toISOString() };
  });

  return { kind: "SB9", fileName: file.name, status: "Atualizada", ...result };
}
