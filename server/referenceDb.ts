// ============================================================
// server/referenceDb.ts
// Persistência das tabelas de referência (SB1, SBZ).
// ============================================================
import { eq } from "drizzle-orm";
import { db } from "./db"; // ajuste o import conforme seu projeto
import { sb1References, sbzReferences } from "./schema"; // tabelas a criar

export async function saveSb1(records: { code: string; tipo: string; familiaCode: string; subfamiliaCode: string }[]) {
  await db.delete(sb1References);
  if (records.length) await db.insert(sb1References).values(records);
  return records.length;
}

export async function saveSbz(records: { chave: string; estoqMin: number | null; estoqMax: number | null; entraMrp: string }[]) {
  await db.delete(sbzReferences);
  if (records.length) await db.insert(sbzReferences).values(records);
  return records.length;
}

export async function loadSb1(): Promise<Map<string, { tipo: string; familiaCode: string; subfamiliaCode: string }>> {
  const rows = await db.select().from(sb1References);
  const map = new Map();
  rows.forEach(r => map.set(r.code, { tipo: r.tipo, familiaCode: r.familiaCode, subfamiliaCode: r.subfamiliaCode }));
  return map;
}

export async function loadSbz(): Promise<Map<string, { estoqMin: number | null; estoqMax: number | null; entraMrp: string }>> {
  const rows = await db.select().from(sbzReferences);
  const map = new Map();
  rows.forEach(r => map.set(r.chave, { estoqMin: r.estoqMin, estoqMax: r.estoqMax, entraMrp: r.entraMrp }));
  return map;
}