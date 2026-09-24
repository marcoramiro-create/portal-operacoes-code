import { TRPCError } from "@trpc/server";
import { assertApplicationPermission, getSupabasePool, type PortalIdentity } from "./supabasePortal";

// ============================================================
// TRANSPORTADORAS (SA4) — cadastro mestre (23/09/2026)
// CNPJ é a CHAVE PRINCIPAL de negócio (dedupe por CNPJ).
// Operação nunca é restritiva: a Descarga aceita transportadora
// não cadastrada (texto livre). SA4 é um facilitador de seleção.
// ============================================================
export type CarrierRow = { code?: string; name: string; cnpj?: string; city?: string; uf?: string };
type CarrierDbRow = { id: string; code: string; name: string; cnpj: string | null; city: string | null; uf: string | null; active: boolean; imported_at: Date };

export function normalizeCnpj(value: string) {
  return (value || "").replace(/\D/g, "");
}
function mapCarrierRow(row: CarrierDbRow) {
  return { id: row.id, code: row.code, name: row.name, cnpj: row.cnpj, city: row.city, uf: row.uf, active: row.active, importedAt: row.imported_at };
}

export async function listActiveCarriers(identity: PortalIdentity) {
  await assertApplicationPermission(identity, "chaves-nf", "view");
  const result = await getSupabasePool().query<CarrierDbRow>(
    `select id, code, name, cnpj, city, uf, active, imported_at
       from public.transportadoras
      where active = true
      order by name asc
      limit 5000`,
  );
  return result.rows.map(mapCarrierRow);
}

// Importa/atualiza em lote, deduplicando por CNPJ (fallback: código interno).
// NUNCA derruba o lote por uma linha ruim: válidas entram, inválidas viram warning.
export async function importCarriers(input: { rows: CarrierRow[]; sourceFileName?: string }, identity: PortalIdentity) {
  await assertApplicationPermission(identity, "chaves-nf", "manage");
  if (!input.rows?.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma linha para importar." });

  const pool = getSupabasePool();
  const client = await pool.connect();
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const warnings: string[] = [];
  try {
    await client.query("begin");
    for (const row of input.rows) {
      const name = (row.name || "").trim();
      if (!name) { skipped += 1; warnings.push("Linha sem nome — ignorada."); continue; }
      const cnpj = normalizeCnpj(row.cnpj || "");
      if (cnpj && !/^\d{14}$/.test(cnpj)) {
        warnings.push(`CNPJ inválido para "${name}" (${row.cnpj}) — importado pelo código quando existir.`);
      }
      let found: { id: string } | undefined;
      if (/^\d{14}$/.test(cnpj)) {
        const hit = await client.query<{ id: string }>("select id from public.transportadoras where cnpj = $1", [cnpj]);
        found = hit.rows[0];
      }
      if (!found && (row.code || "").trim()) {
        const hit = await client.query<{ id: string }>("select id from public.transportadoras where code = $1", [row.code.trim()]);
        found = hit.rows[0];
      }
      if (found) {
        await client.query(
          `update public.transportadoras
              set name = $1, cnpj = coalesce($2, cnpj), city = coalesce(nullif($3, ''), city), uf = coalesce(nullif($4, ''), uf), active = true, updated_at = now()
            where id = $5`,
          [name, /^\d{14}$/.test(cnpj) ? cnpj : null, (row.city || "").trim(), (row.uf || "").trim(), found.id],
        );
        updated += 1;
      } else {
        const inserted = await client.query<{ id: string }>(
          `insert into public.transportadoras (code, name, cnpj, city, uf, source_file)
           values ($1, $2, $3, $4, $5, $6) returning id`,
          [(row.code || "").trim(), name, /^\d{14}$/.test(cnpj) ? cnpj : null, (row.city || "").trim(), (row.uf || "").trim(), input.sourceFileName || null],
        );
        imported += inserted.rows[0] ? 1 : 0;
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  await pool.query(
    "insert into public.audit_events (actor_user_id, entity_type, entity_id, action, details) values ($1, 'transportadora', $2, 'imported', jsonb_build_object('imported', $3::int, 'updated', $4::int, 'skipped', $5::int, 'source_file', $6::text))",
    [identity.id, "batch", imported, updated, skipped, input.sourceFileName || null],
  );
  return { imported, updated, skipped, warnings };
}