import type { Request } from "express";
import { sql } from "drizzle-orm";
import { getDb, reenriquecerImportacaoCompras } from "./db";
import { listOneDriveFiles, readOneDriveContent } from "./oneDriveOAuth";
import { referenceImports, sb1References, sbzReferences } from "../drizzle/schema";
import { prepareReference, selectReferenceFile, type ReferenceKind, type SourceFile } from "./oneDriveReferenceRules";
import { buildClassificationMaterializationPlan } from "./catalogClassificationMaterialization";
import { ENV } from "./_core/env";

const REFERENCE_KINDS: ReferenceKind[] = ["SB1", "SBZ", "ZFM", "ZSF"];

type PreparedReference = ReturnType<typeof prepareReference> & { file: SourceFile };

function itemCount(item: PreparedReference) {
  if (item.kind === "SB1") return item.sb1.length;
  if (item.kind === "SBZ") return item.sbz.length;
  return item.catalog.length;
}

async function materializeClassifications(tx: any, prepared: PreparedReference[]) {
  const sb1 = prepared.find(item => item.kind === "SB1");
  const zfm = prepared.find(item => item.kind === "ZFM");
  const zsf = prepared.find(item => item.kind === "ZSF");
  if (!sb1 || !zfm || !zsf) throw new Error("ZFM/ZSF: fontes necessárias não preparadas.");

  const plan = buildClassificationMaterializationPlan({
    families: zfm.catalog,
    subfamilies: zsf.catalog,
    products: sb1.products,
  });
  const batchIds = new Map<string, string>();
  for (const item of [zfm, zsf]) {
    const batch = await tx.execute(sql`
      insert into public.operational_import_batches
        (source_kind, file_name, file_hash, status, row_count, metadata)
      values (${item.kind}, ${item.file.name}, ${item.hash}, 'processed', ${item.catalog.length}, ${JSON.stringify({ parser: "protheusCatalogParsers", source: "OneDrive" })}::jsonb)
      on conflict (source_kind, file_hash) do update set
        file_name = excluded.file_name,
        status = 'processed',
        row_count = excluded.row_count,
        metadata = excluded.metadata
      returning id
    `);
    batchIds.set(item.kind, String(batch.rows[0].id));
  }

  for (const item of [zfm, zsf]) {
    const kind = item.kind === "ZFM" ? "FAMILIA" : "SUBFAMILIA";
    const sourceSystem = item.kind;
    for (let start = 0; start < item.catalog.length; start += 500) {
      const rows = item.catalog.slice(start, start + 500);
      for (const row of rows) {
        await tx.execute(sql`
          insert into public.corporate_catalog_classifications
            (kind, code, description, source_batch_id, source_system, active, updated_at)
          values (${kind}, ${row.code}, ${row.description}, ${batchIds.get(item.kind)}, ${sourceSystem}, true, now())
          on conflict (kind, code) do update set
            description = excluded.description,
            source_batch_id = excluded.source_batch_id,
            source_system = excluded.source_system,
            active = true,
            valid_to = null,
            updated_at = now()
        `);
      }
    }
  }

  // Reconstrói apenas os vínculos ativos da SB1. Produtos sem classificação
  // correspondente permanecem no cadastro e entram no diagnóstico retornado.
  for (let start = 0; start < sb1.products.length; start += 500) {
    const rows = sb1.products.slice(start, start + 500);
    if (!rows.length) continue;
    const incoming = sql.join(rows.map(row => sql`(${row.productCode}, ${row.family}, ${row.subfamily})`), sql`, `);
    await tx.execute(sql`
      with incoming(product_code, family_code, subfamily_code) as (values ${incoming}),
      matched as (
        select p.id as product_id, c.id as classification_id, c.kind as classification_kind,
          case when c.kind = 'FAMILIA' then ${batchIds.get("ZFM")}::uuid else ${batchIds.get("ZSF")}::uuid end as source_batch_id
        from incoming i
        join public.products p on p.source_product_code = i.product_code or p.product_code = i.product_code
        join public.corporate_catalog_classifications c on
          (c.kind = 'FAMILIA' and c.code = i.family_code)
          or (c.kind = 'SUBFAMILIA' and c.code = i.subfamily_code)
        where c.active = true
      )
      update public.product_classification_links l
      set active = false, valid_to = current_date, source_batch_id = m.source_batch_id
      from matched m
      where l.product_id = m.product_id
        and l.classification_kind = m.classification_kind
        and l.active = true
    `);
    await tx.execute(sql`
      with incoming(product_code, family_code, subfamily_code) as (values ${incoming}),
      matched as (
        select p.id as product_id, c.id as classification_id, c.kind as classification_kind,
          case when c.kind = 'FAMILIA' then ${batchIds.get("ZFM")}::uuid else ${batchIds.get("ZSF")}::uuid end as source_batch_id
        from incoming i
        join public.products p on p.source_product_code = i.product_code or p.product_code = i.product_code
        join public.corporate_catalog_classifications c on
          (c.kind = 'FAMILIA' and c.code = i.family_code)
          or (c.kind = 'SUBFAMILIA' and c.code = i.subfamily_code)
        where c.active = true
      )
      insert into public.product_classification_links
        (product_id, classification_id, classification_kind, source_batch_id, active, valid_from)
      select product_id, classification_id, classification_kind, source_batch_id, true, current_date
      from matched
      on conflict (product_id, classification_id, valid_from) do update set active = true, valid_to = null, source_batch_id = excluded.source_batch_id
    `);
  }
  return plan.issues;
}

export async function syncOneDriveReferences(req: Request) {
  const allowedFolders = new Set(["Documents/Documentos/Portal de Operações/Cadastros", "Documentos/Portal de Operações/Cadastros"]);
  if (process.cwd() !== "/home/ubuntu/portal-operacoes-homolog" || !allowedFolders.has(ENV.onedriveFolderPath)) throw new Error("Atualização bloqueada: diretório ou pasta não corresponde à Homologação autorizada.");
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const check = await db.execute(sql`select current_database() as name`);
  if (check.rows[0]?.name !== "portal_operacoes") throw new Error("Atualização bloqueada: banco não corresponde à Homologação.");
  const tables = await db.execute(sql`select to_regclass('public.corporate_catalog_classifications') as classifications, to_regclass('public.product_classification_links') as links`);
  if (!tables.rows[0]?.classifications || !tables.rows[0]?.links) throw new Error("Cadastro unificado ainda não instalado: aplique a migração 0052 na Homologação antes de atualizar as bases.");
  const listing = await listOneDriveFiles(req);
  if (!listing.connected) throw new Error("Conecte o OneDrive antes de atualizar.");
  const previousStates = await db.execute(sql`
    select kind, item_id, file_hash, modified_at
    from public.portal_onedrive_reference_state
    where kind in ('SB1', 'SBZ', 'ZFM', 'ZSF')
  `);
  const stateByKind = new Map(previousStates.rows.map(row => [String(row.kind), row]));
  const prepared: PreparedReference[] = [];
  for (const kind of REFERENCE_KINDS) {
    const file = selectReferenceFile(listing.files, kind);
    const prior = stateByKind.get(kind);
    const unchangedByMetadata = prior
      && String(prior.item_id) === file.id
      && new Date(String(prior.modified_at)).getTime() === new Date(file.modifiedAt).getTime();
    if (unchangedByMetadata && (kind === "SB1" || kind === "SBZ")) {
      if (kind === "SB1") {
        const products = await db.execute(sql`
          select source_product_code as "productCode",
            coalesce(metadata->>'familia', '') as family,
            coalesce(metadata->>'subfamilia', '') as subfamily
          from public.products
          where active = true and source_system = 'SB1'
        `);
        prepared.push({ file, kind, hash: String(prior.file_hash), sb1: [], sbz: [], catalog: [], products: products.rows as { productCode: string; family: string; subfamily: string }[] });
      } else {
        prepared.push({ file, kind, hash: String(prior.file_hash), sb1: [], sbz: [], catalog: [], products: [] });
      }
      continue;
    }
    const content = await readOneDriveContent(req, file.id);
    prepared.push({ file, ...prepareReference(kind, content) });
  }

  const results = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(714048)`);
    const result: {kind:string;fileName:string;status:string;count:number;updatedAt:string}[] = [];
    for (const item of prepared) {
      const prior = await tx.execute(sql`select file_hash, updated_at from public.portal_onedrive_reference_state where kind=${item.kind}`);
      const count = itemCount(item);
      if (prior.rows[0]?.file_hash === item.hash) {
        result.push({kind:item.kind,fileName:item.file.name,status:"Sem alteração",count,updatedAt:String(prior.rows[0].updated_at)});
        continue;
      }
      if (item.kind === "SB1") {
        await tx.delete(sb1References);
        for (let i=0;i<item.sb1.length;i+=500) await tx.insert(sb1References).values(item.sb1.slice(i,i+500));
      } else if (item.kind === "SBZ") {
        await tx.delete(sbzReferences);
        for (let i=0;i<item.sbz.length;i+=500) await tx.insert(sbzReferences).values(item.sbz.slice(i,i+500));
      }
      await tx.insert(referenceImports).values({kind:item.kind.toLowerCase(),fileName:item.file.name,rowCount:count});
      await tx.execute(sql`insert into public.portal_onedrive_reference_state(kind,item_id,file_name,file_hash,modified_at,row_count,updated_at)
        values(${item.kind},${item.file.id},${item.file.name},${item.hash},${item.file.modifiedAt}::timestamptz,${count},now())
        on conflict(kind) do update set item_id=excluded.item_id,file_name=excluded.file_name,file_hash=excluded.file_hash,modified_at=excluded.modified_at,row_count=excluded.row_count,updated_at=now()`);
      result.push({kind:item.kind,fileName:item.file.name,status:"Atualizada",count,updatedAt:new Date().toISOString()});
    }
    const classificationIssues = await materializeClassifications(tx, prepared);
    return { result, classificationIssues };
  });
  let warning: string | null = null;
  let reenriquecidos = 0;
  if (results.result.some(r => r.status === "Atualizada" && ["SB1", "SBZ"].includes(r.kind))) {
    try { reenriquecidos = await reenriquecerImportacaoCompras(); }
    catch { warning = "SB1/SBZ atualizadas. O reprocessamento da última carga de Compras falhou; não considerar as análises atualizadas até reprocessá-la."; }
  }
  if (results.classificationIssues.length) warning = `${warning ? `${warning} ` : ""}${results.classificationIssues.length} vínculo(s) SB1 ficaram pendentes por ausência de Família/SubFamília correspondente.`;
  return { results: results.result, reenriquecidos, warning, classificationIssues: results.classificationIssues };
}
