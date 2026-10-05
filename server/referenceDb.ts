// Persistência de compatibilidade para tabelas de referência Protheus.
// O pipeline novo usa operationalImportService; estas funções permanecem para
// chamadas legadas até a unificação definitiva dos importadores.
import { getDb } from "./db";
import { sb1References, sbzReferences } from "../drizzle/schema";

export async function saveSb1(records: { code: string; tipo: string; familiaCode: string; subfamiliaCode: string }[]) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(sb1References);
  if (records.length) await db.insert(sb1References).values(records);
  return records.length;
}

export async function saveSbz(records: { chave: string; code?: string; filial?: string; estoqMin: number | null; estoqMax: number | null; entraMrp: string }[]) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(sbzReferences);
  if (records.length) {
    await db.insert(sbzReferences).values(records.map((record) => ({
      chave: record.chave,
      code: record.code ?? "",
      filial: record.filial ?? "",
      estoqMin: record.estoqMin?.toString() ?? null,
      estoqMax: record.estoqMax?.toString() ?? null,
      entraMrp: record.entraMrp,
    })));
  }
  return records.length;
}

export async function loadSb1(): Promise<Map<string, { tipo: string; familiaCode: string; subfamiliaCode: string }>> {
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db.select().from(sb1References);
  const map = new Map<string, { tipo: string; familiaCode: string; subfamiliaCode: string }>();
  rows.forEach((row) => map.set(row.code, { tipo: row.tipo, familiaCode: row.familiaCode, subfamiliaCode: row.subfamiliaCode }));
  return map;
}

export async function loadSbz(): Promise<Map<string, { estoqMin: number | null; estoqMax: number | null; entraMrp: string }>> {
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db.select().from(sbzReferences);
  const map = new Map<string, { estoqMin: number | null; estoqMax: number | null; entraMrp: string }>();
  rows.forEach((row) => map.set(row.chave, {
    estoqMin: row.estoqMin == null ? null : Number(row.estoqMin),
    estoqMax: row.estoqMax == null ? null : Number(row.estoqMax),
    entraMrp: row.entraMrp,
  }));
  return map;
}
