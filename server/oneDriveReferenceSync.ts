import type { Request } from "express";
import { sql } from "drizzle-orm";
import { getDb, reenriquecerImportacaoCompras } from "./db";
import { listOneDriveFiles, readOneDriveContent } from "./oneDriveOAuth";
import { referenceImports, sb1References, sbzReferences } from "../drizzle/schema";
import { prepareReference, selectReferenceFile, type ReferenceKind, type SourceFile } from "./oneDriveReferenceRules";
import { ENV } from "./_core/env";
export async function syncOneDriveReferences(req: Request) {
  if (process.cwd() !== "/home/ubuntu/portal-operacoes-homolog" || ENV.onedriveFolderPath !== "Documents/Documentos/Portal de Operações/Cadastros") throw new Error("Atualização bloqueada: diretório ou pasta não corresponde à Homologação autorizada.");
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const check = await db.execute(sql`select current_database() as name`);
  if (check.rows[0]?.name !== "portal_operacoes") throw new Error("Atualização bloqueada: banco não corresponde à Homologação.");
  const listing = await listOneDriveFiles(req); // valida administrador e limita à raiz autorizada
  if (!listing.connected) throw new Error("Conecte o OneDrive antes de atualizar.");
  const prepared: (ReturnType<typeof prepareReference> & {file: SourceFile})[] = [];
  for (const kind of ["SB1", "SBZ"] as ReferenceKind[]) {
    const file = selectReferenceFile(listing.files, kind);
    const content = await readOneDriveContent(req, file.id);
    prepared.push({ file, ...prepareReference(kind, content) });
  }
  // Todas as leituras e validações terminam antes da substituição de qualquer base.
  const results = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(714048)`);
    const results: {kind:string;fileName:string;status:string;count:number;updatedAt:string}[] = [];
    for (const item of prepared) {
      const prior = await tx.execute(sql`select file_hash, updated_at from public.portal_onedrive_reference_state where kind=${item.kind}`);
      const count = item.kind === "SB1" ? item.sb1.length : item.sbz.length;
      if (prior.rows[0]?.file_hash === item.hash) {
        results.push({kind:item.kind,fileName:item.file.name,status:"Sem alteração",count,updatedAt:String(prior.rows[0].updated_at)});
        continue;
      }
      if (item.kind === "SB1") {
        await tx.delete(sb1References);
        for (let i=0;i<item.sb1.length;i+=500) await tx.insert(sb1References).values(item.sb1.slice(i,i+500));
      } else {
        await tx.delete(sbzReferences);
        for (let i=0;i<item.sbz.length;i+=500) await tx.insert(sbzReferences).values(item.sbz.slice(i,i+500));
      }
      await tx.insert(referenceImports).values({kind:item.kind.toLowerCase(),fileName:item.file.name,rowCount:count});
      await tx.execute(sql`insert into public.portal_onedrive_reference_state(kind,item_id,file_name,file_hash,modified_at,row_count,updated_at)
        values(${item.kind},${item.file.id},${item.file.name},${item.hash},${item.file.modifiedAt}::timestamptz,${count},now())
        on conflict(kind) do update set item_id=excluded.item_id,file_name=excluded.file_name,file_hash=excluded.file_hash,modified_at=excluded.modified_at,row_count=excluded.row_count,updated_at=now()`);
      results.push({kind:item.kind,fileName:item.file.name,status:"Atualizada",count,updatedAt:new Date().toISOString()});
    }
    return results;
  });
  let warning: string | null = null;
  let reenriquecidos = 0;
  if (results.some(r => r.status === "Atualizada")) {
    try { reenriquecidos = await reenriquecerImportacaoCompras(); }
    catch { warning = "SB1/SBZ atualizadas. O reprocessamento da última carga de Compras falhou; não considerar as análises atualizadas até reprocessá-la."; }
  }
  return { results, reenriquecidos, warning };
}
