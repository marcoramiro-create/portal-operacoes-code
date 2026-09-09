// ============================================================
// server/db.ts
// Camada de acesso ao banco (PostgreSQL/Supabase via Drizzle).
// Módulo: server (API tRPC)
// Data: 08/09/2026
// MUDANÇA (08/09/2026): raw:true preserva números; grava campos calculados.
// MUDANÇA (08/09/2026): chave SBZ recalculada em memória (code + filial 4 dígitos).
// MUDANÇA (08/09/2026): mrp nunca vai vazio (coluna é enum Sim/Não).
// MUDANÇA (08/09/2026): COBERTURA = MÉDIA PONDERADA pelo valor em estoque.
// MUDANÇA (08/09/2026): importedAt = data REAL da importação (não a do nome do arquivo).
// MUDANÇA (08/09/2026): RE-ENRIQUECIMENTO NÃO-DESTRUTIVO DEFINITIVO.
//   O usuário identificou que o MRP "Sim" aparecia e sumia: o re-enriquecimento
//   automático reescrevia o MRP, forçando "Não" quando o re-cruzamento não achava
//   correspondência na SBZ. A partir de agora o MRP NUNCA é reescrito pelo
//   re-enriquecimento — ele é definido UMA ÚNICA VEZ, na importação da Compras
//   (cruzamento com a SBZ). Nenhum gatilho posterior pode alterar o MRP gravado.
// MUDANÇA (09/09/2026): importedAt = data/hora do NOME do arquivo (histórico).
// MUDANÇA (09/09/2026): bloqueio de duplicidade — só uma importação por nome.
// ============================================================
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as XLSX from "xlsx";
import { familyReferences, inventoryAnalytics, protheusImports, referenceImports, sb1References, sbzReferences, subfamilyReferences, type InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { calculateTurnover } from "./analyticsRules";
import { emissaoDoNomeArquivo, importarCompras, reenriquecerCompras } from "./protheusImport";
import type { Sb1Index, Sb1Row, SbzIndex, SbzRow, FamiliasMap } from "./referenceImporters";
import { storagePut } from "./storage";
let _db: ReturnType<typeof drizzle> | null = null;
export async function getDb() {
  if (!_db && process.env.SUPABASE_DATABASE_URL) {
    try {
      const pool = new Pool({
        connectionString: process.env.SUPABASE_DATABASE_URL,
        max: 3,
        idleTimeoutMillis: 20000,
        connectionTimeoutMillis: 10000,
      });
      pool.on('error', (err) => {
        console.error('[Database] Unexpected error on idle client:', err);
      });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(users).where(eq(users.openId, user.openId)).limit(1);
  if (existing.length > 0) {
    const updateSet: Record<string, unknown> = {};
    if (user.name !== undefined) updateSet.name = user.name ?? null;
    if (user.email !== undefined) updateSet.email = user.email ?? null;
    if (user.loginMethod !== undefined) updateSet.loginMethod = user.loginMethod ?? null;
    updateSet.lastSignedIn = new Date();
    await db.update(users).set(updateSet).where(eq(users.openId, user.openId));
  } else {
    await db.insert(users).values({
      openId: user.openId,
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      role: user.openId === ENV.ownerOpenId ? "admin" : "user",
      lastSignedIn: new Date(),
    });
  }
}
export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}
// ===== Tabelas de referência (SB1, SBZ, Família, SubFamília) =====
export async function saveSb1References(records: { code: string; tipo: string; familiaCode: string; subfamiliaCode: string }[]) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(sb1References);
  for (let start = 0; start < records.length; start += 500) {
    await db.insert(sb1References).values(records.slice(start, start + 500));
  }
  return records.length;
}
export async function saveSbzReferences(records: { chave: string; code: string; filial: string; estoqMin: number | null; estoqMax: number | null; entraMrp: string }[]) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(sbzReferences);
  for (let start = 0; start < records.length; start += 500) {
    await db.insert(sbzReferences).values(records.slice(start, start + 500));
  }
  return records.length;
}
export async function saveFamilyReferences(records: { code: string; descricao: string }[]) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(familyReferences);
  for (let start = 0; start < records.length; start += 500) {
    await db.insert(familyReferences).values(records.slice(start, start + 500));
  }
  return records.length;
}
export async function saveSubfamilyReferences(records: { code: string; descricao: string }[]) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(subfamilyReferences);
  for (let start = 0; start < records.length; start += 500) {
    await db.insert(subfamilyReferences).values(records.slice(start, start + 500));
  }
  return records.length;
}
export async function saveReferenceImport(kind: "sb1" | "sbz" | "familias" | "subfamilias", fileName: string, records: unknown[]) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const batchSize = 2000;
  return db.transaction(async (tx) => {
    if (kind === "sb1") {
      const rows = records as { code: string; tipo: string; familiaCode: string; subfamiliaCode: string }[];
      await tx.delete(sb1References);
      for (let start = 0; start < rows.length; start += batchSize) {
        await tx.insert(sb1References).values(rows.slice(start, start + batchSize));
      }
    } else if (kind === "sbz") {
      const rows = records as { chave: string; code: string; filial: string; estoqMin: number | null; estoqMax: number | null; entraMrp: string }[];
      await tx.delete(sbzReferences);
      for (let start = 0; start < rows.length; start += batchSize) {
        await tx.insert(sbzReferences).values(rows.slice(start, start + batchSize));
      }
    } else if (kind === "familias") {
      const rows = records as { code: string; descricao: string }[];
      await tx.delete(familyReferences);
      for (let start = 0; start < rows.length; start += batchSize) {
        await tx.insert(familyReferences).values(rows.slice(start, start + batchSize));
      }
    } else {
      const rows = records as { code: string; descricao: string }[];
      await tx.delete(subfamilyReferences);
      for (let start = 0; start < rows.length; start += batchSize) {
        await tx.insert(subfamilyReferences).values(rows.slice(start, start + batchSize));
      }
    }
    await tx.insert(referenceImports).values({ kind, fileName, rowCount: records.length });
    return records.length;
  });
}
export async function loadSb1References(): Promise<Map<string, { tipo: string; familiaCode: string; subfamiliaCode: string }>> {
  const db = await getDb();
  const map = new Map<string, { tipo: string; familiaCode: string; subfamiliaCode: string }>();
  if (!db) return map;
  const rows = await db.select().from(sb1References);
  rows.forEach(r => map.set(r.code, { tipo: r.tipo, familiaCode: r.familiaCode, subfamiliaCode: r.subfamiliaCode }));
  return map;
}
export async function loadSbzReferences(): Promise<Map<string, { estoqMin: number | null; estoqMax: number | null; entraMrp: string }>> {
  const db = await getDb();
  const map = new Map<string, { estoqMin: number | null; estoqMax: number | null; entraMrp: string }>();
  if (!db) return map;
  const rows = await db.select().from(sbzReferences);
  rows.forEach(r => map.set(r.chave, { estoqMin: r.estoqMin == null ? null : Number(r.estoqMin), estoqMax: r.estoqMax == null ? null : Number(r.estoqMax), entraMrp: r.entraMrp }));
  return map;
}
export async function loadFamilyReferences(): Promise<Map<string, string>> {
  const db = await getDb();
  const map = new Map<string, string>();
  if (!db) return map;
  const rows = await db.select().from(familyReferences);
  rows.forEach(r => map.set(r.code, r.descricao));
  return map;
}
export async function loadSubfamilyReferences(): Promise<Map<string, string>> {
  const db = await getDb();
  const map = new Map<string, string>();
  if (!db) return map;
  const rows = await db.select().from(subfamilyReferences);
  rows.forEach(r => map.set(r.code, r.descricao));
  return map;
}
export async function loadAllReferences() {
  const [sb1, sbz, familias, subfamilias] = await Promise.all([loadSb1References(), loadSbzReferences(), loadFamilyReferences(), loadSubfamilyReferences()]);
  return { sb1, sbz, familias, subfamilias };
}
// ============================================================
// Helpers de normalização (08/09/2026)
// ============================================================
function normalizeCodeLocal(codigo: string | null | undefined): string {
  if (!codigo) return "";
  const texto = String(codigo).trim();
  const partes = texto.split("-");
  const numero = (partes[0] || "").replace(/^0+/, "") || "0";
  if (partes.length > 1) return `${numero}-${partes.slice(1).join("-")}`;
  return numero;
}
function normalizarFilial(value: unknown): string {
  const texto = String(value ?? "").trim();
  const match = texto.match(/^(\d+)/);
  const digits = match ? match[1] : texto;
  return digits.padStart(4, "0");
}
// MUDANÇA (08/09/2026): chave SBZ RECALCULADA aqui (code normalizado + filial
// normalizada em 4 dígitos) em vez de confiar na coluna chave gravada.
async function montarIndicesReferencias(): Promise<{ sb1: Sb1Index; sbz: SbzIndex; familias: FamiliasMap; subFamilias: FamiliasMap }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const [sb1Rows, sbzRows, famRows, subRows] = await Promise.all([
    db.select().from(sb1References),
    db.select().from(sbzReferences),
    db.select().from(familyReferences),
    db.select().from(subfamilyReferences),
  ]);
  const porCodigo = new Map<string, Sb1Row>();
  const porCodAgregado = new Map<string, Sb1Row>();
  const registros: Sb1Row[] = [];
  for (const r of sb1Rows) {
    const chave = String(r.code ?? "").trim();
    if (!chave) continue;
    const linha: Sb1Row = {
      codigo: chave,
      codAgregado: chave,
      descricao: "",
      tipo: r.tipo,
      familiaCod: r.familiaCode,
      subFamiliaCod: r.subfamiliaCode,
    };
    registros.push(linha);
    porCodigo.set(chave, linha);
    porCodAgregado.set(chave, linha);
  }
  const porChave = new Map<string, SbzRow>();
  for (const r of sbzRows) {
    const codigo = normalizeCodeLocal(r.code);
    const filial = normalizarFilial(r.filial);
    if (!codigo || !filial) continue;
    const chave = codigo + filial;
    if (porChave.has(chave)) continue;
    porChave.set(chave, { chave, codigo, filial, entraMrp: r.entraMrp });
  }
  return {
    sb1: { porCodigo, porCodAgregado, registros },
    sbz: { porChave },
    familias: new Map(famRows.map(f => [f.code, f.descricao])),
    subFamilias: new Map(subRows.map(s => [s.code, s.descricao])),
  };
}
export type ProtheusImportStatus = "pending" | "approved" | "archived";
export async function listProtheusImports() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(protheusImports).orderBy(desc(protheusImports.importedAt));
}
export async function updateProtheusImportStatus(id: number, status: ProtheusImportStatus) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const result = await db.update(protheusImports).set({ status }).where(eq(protheusImports.id, id)).returning();
  if (result.length === 0) throw new Error("Versão de carga não encontrada.");
  return result[0];
}
export async function importProtheusWorkbook(fileName: string, fileBuffer: Buffer) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  // REGRA (09/09/2026): só pode existir UMA importação com cada nome de arquivo.
  const duplicado = await db
    .select({ id: protheusImports.id })
    .from(protheusImports)
    .where(eq(protheusImports.fileName, fileName))
    .limit(1);
  if (duplicado.length > 0) {
    throw new Error("Já existe uma importação com este arquivo. Só é permitida uma carga por nome de arquivo.");
  }
  const workbook = XLSX.read(fileBuffer, { type: "buffer", cellText: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("A planilha não possui uma aba para importação.");
  const linhasBrutas = XLSX.utils.sheet_to_json<unknown[]>(
    workbook.Sheets[firstSheetName],
    { header: 1, raw: true, defval: "" }
  );
  const { sb1, sbz, familias, subFamilias } = await montarIndicesReferencias();
  const emissao = emissaoDoNomeArquivo(fileName);
  const { registros } = importarCompras(linhasBrutas, sb1, sbz, familias, subFamilias, emissao);
  // REGRA (09/09/2026): IMPORTEDAT = DATA/HORA DO NOME DO ARQUIVO (histórico).
  // A data da importação NÃO é usada como data da carga — o histórico é a data
  // do nome do arquivo (Compras - aaaaMMddHHmm.xlsx), sempre invertida.
  const importedAt = parsePurchaseHistoryDate(fileName);
  const versionName = fileName.replace(/\.xlsx$/i, "");
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedFile = await storagePut(
    `protheus-imports/${Date.now()}-${safeFileName}`,
    fileBuffer,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  return db.transaction(async (tx) => {
    const [createdImport] = await tx
      .insert(protheusImports)
      .values({
        fileName,
        versionName,
        fileKey: storedFile.key,
        rowCount: registros.length,
        importedAt,
      })
      .returning({ id: protheusImports.id });
    const importId = createdImport?.id;
    if (!importId) throw new Error("Não foi possível registrar a importação.");
    for (let start = 0; start < registros.length; start += 500) {
      await tx.insert(inventoryAnalytics).values(
        registros.slice(start, start + 500).map((r) => ({
          importId,
          code: r.codigo,
          description: r.descricao || "",
          branch: r.filial,
          productType: (r.tipo || "").toUpperCase() === "PE" ? "PE" : "ME",
          mrp: r.mrp === "Sim" ? "Sim" : "Não",
          family: r.familia || "",
          subfamily: r.subFamilia || "",
          curve: r.curva,
          sales13M: r.total,
          salesValue13M: r.custoTot13M,
          stock: r.estoque,
          stockValue: r.stockValue,
          coverageDays: r.coverageDays,
          excessValue: r.excessValue,
        }))
      );
    }
    return { id: importId, rowCount: registros.length };
  });
}
export async function reenriquecerImportacaoCompras(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const importId = await getLatestImportId();
  if (!importId) return 0;
  const itens = await db
    .select({
      id: inventoryAnalytics.id,
      codigo: inventoryAnalytics.code,
      filial: inventoryAnalytics.branch,
      descricao: inventoryAnalytics.description,
    })
    .from(inventoryAnalytics)
    .where(eq(inventoryAnalytics.importId, importId));
  if (itens.length === 0) return 0;
  const { sb1, sbz, familias, subFamilias } = await montarIndicesReferencias();
  const enriquecidos = reenriquecerCompras(
    itens.map((i) => ({ codigo: i.codigo, filial: i.filial, descricao: i.descricao })),
    sb1,
    sbz,
    familias,
    subFamilias
  );
  // MUDANÇA (08/09/2026): RE-ENRIQUECIMENTO NÃO-DESTRUTIVO DEFINITIVO.
  // O usuário identificou o sintoma "MRP Sim aparece e some": o re-enriquecimento
  // reescrevia o MRP, forçando "Não" quando o re-cruzamento não achava
  // correspondência na SBZ. A partir de agora o MRP NUNCA é atualizado aqui —
  // ele é definido UMA ÚNICA VEZ, na importação da Compras (cruzamento com a SBZ).
  // Este gatilho apenas PREENCHE campos de cadastro (tipo/família/subfamília)
  // quando o cadastro devolveu valor; caso contrário preserva o gravado.
  return db.transaction(async (tx) => {
    for (let i = 0; i < enriquecidos.length; i++) {
      const e = enriquecidos[i];
      const set: Record<string, unknown> = {};
      const tipo = (e.tipo || "").toUpperCase();
      if (tipo === "PE" || tipo === "ME") set.productType = tipo;
      if (e.familia) set.family = e.familia;
      if (e.subFamilia) set.subfamily = e.subFamilia;
      // MRP: NUNCA atualizado aqui (preserva o valor vindo da importação da Compras).
      if (Object.keys(set).length > 0) {
        await tx
          .update(inventoryAnalytics)
          .set(set)
          .where(eq(inventoryAnalytics.id, itens[i].id));
      }
    }
    return enriquecidos.length;
  });
}
const ANALYSIS_BRANCHES = ["0101", "0102", "0103", "0106", "0107", "0108", "0301", "0303", "0304", "0305", "0306", "0307"];
type Curve = "A" | "B" | "C" | "D" | "E";
type ProductType = "ME" | "PE";
export type AnalyticsFilter = {
  importId?: number;
  branch?: string;
  curve?: Curve;
  productType?: ProductType;
  mrp?: "Sim" | "Não";
  family?: string;
  subfamily?: string;
};
export type AnalyticsItem = {
  id: number;
  code: string;
  description: string;
  branch: string;
  productType: ProductType;
  mrp: "Sim" | "Não";
  family: string;
  subfamily: string;
  curve: Curve;
  sales13M: number;
  salesValue13M: number;
  stock: number;
  stockValue: number;
  coverageDays: number;
  excessValue: number;
  turnover: number;
};
export type StockQuality = {
  stockWithoutSalesValue: number;
  lowCoverageStockValue: number;
  excessStockValue: number;
};
export type AnalyticsGroup = {
  label: string;
  salesValue13M: number;
  stockValue: number;
  turnover: number;
  coverageDays: number;
  excessValue: number;
};
export type AnalyticsSummary = {
  salesValue13M: number;
  stockValue: number;
  coverageDays: number;
  excessValue: number;
  totalItems: number;
  lowCoverageItems: number;
  lowCoverageStockValue: number;
};
async function getLatestImportId(selectedId?: number) {
  const db = await getDb();
  if (!db) return undefined;
  if (selectedId) {
    return (
      await db
        .select({ id: protheusImports.id })
        .from(protheusImports)
        .where(and(eq(protheusImports.id, selectedId), eq(protheusImports.status, "approved")))
        .limit(1)
    )[0]?.id;
  }
  return (
    await db
      .select({ id: protheusImports.id })
      .from(protheusImports)
      .where(eq(protheusImports.status, "approved"))
      .orderBy(desc(protheusImports.importedAt))
      .limit(1)
  )[0]?.id;
}
const asNumber = (value: unknown) => Number(value ?? 0);
const normalizeLabel = (value: string) => value || "Não informado";
export function formatPurchaseVersionName(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `Compras - ${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
}
const PURCHASE_FILE_NAME_PATTERN = /^Compras - (\d{4})(\d{2})(\d{2})(\d{2})(\d{2}).xlsx$/i;
export function parsePurchaseHistoryDate(fileName: string) {
  const match = fileName.match(PURCHASE_FILE_NAME_PATTERN);
  if (!match) throw new Error("O nome deve seguir o padrão Compras - aaaaMMddHHmm.xlsx.");
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day) || date.getUTCHours() !== Number(hour) || date.getUTCMinutes() !== Number(minute)) {
    throw new Error("A data/hora no nome da planilha não é válida.");
  }
  return date;
}
function historicalImportDate(fileName: string, _versionName: string, _importedAt: Date) {
  // REGRA (09/09/2026): a data do histórico é SEMPRE extraída do nome do arquivo
  // (Compras - aaaaMMddHHmm.xlsx), nunca a data da importação.
  return parsePurchaseHistoryDate(fileName);
}
export async function getAnalyticsSummary(filters: AnalyticsFilter): Promise<AnalyticsSummary | null> {
  const db = await getDb();
  const importId = await getLatestImportId(filters.importId);
  if (!db || !importId) return null;
  const conditions = [eq(inventoryAnalytics.importId, importId), inArray(inventoryAnalytics.branch, ANALYSIS_BRANCHES)];
  if (filters.branch) conditions.push(eq(inventoryAnalytics.branch, filters.branch));
  if (filters.curve) conditions.push(eq(inventoryAnalytics.curve, filters.curve));
  if (filters.productType) conditions.push(eq(inventoryAnalytics.productType, filters.productType));
  if (filters.mrp) conditions.push(eq(inventoryAnalytics.mrp, filters.mrp));
  if (filters.family) conditions.push(eq(inventoryAnalytics.family, filters.family));
  if (filters.subfamily) conditions.push(eq(inventoryAnalytics.subfamily, filters.subfamily));
  const whereClause = and(...conditions);
  const measures = {
    salesValue13M: sql<string>`coalesce(sum(${inventoryAnalytics.salesValue13M}), 0)`,
    stockValue: sql<string>`coalesce(sum(${inventoryAnalytics.stockValue}), 0)`,
    coverageDays: sql<string>`coalesce(sum(${inventoryAnalytics.coverageDays} * ${inventoryAnalytics.stockValue}) / nullif(sum(${inventoryAnalytics.stockValue}), 0), 0)`,
    excessValue: sql<string>`coalesce(sum(${inventoryAnalytics.excessValue}), 0)`,
    totalItems: sql<number>`count(*)`,
    lowCoverageItems: sql<number>`count(case when ${inventoryAnalytics.coverageDays} < 30 and ${inventoryAnalytics.stockValue} > 0 then 1 end)`,
    lowCoverageStockValue: sql<string>`coalesce(sum(case when ${inventoryAnalytics.coverageDays} < 30 and ${inventoryAnalytics.stockValue} > 0 then ${inventoryAnalytics.stockValue} else 0 end), 0)`,
  };
  const [summary] = await db.select(measures).from(inventoryAnalytics).where(whereClause);
  return {
    salesValue13M: asNumber(summary.salesValue13M),
    stockValue: asNumber(summary.stockValue),
    coverageDays: asNumber(summary.coverageDays),
    excessValue: asNumber(summary.excessValue),
    totalItems: Number(summary.totalItems ?? 0),
    lowCoverageItems: Number(summary.lowCoverageItems ?? 0),
    lowCoverageStockValue: asNumber(summary.lowCoverageStockValue),
  };
}
export async function getAnalyticsBreakdown(filters: AnalyticsFilter) {
  const db = await getDb();
  const importId = await getLatestImportId(filters.importId);
  if (!db || !importId) return null;
  const conditions = [eq(inventoryAnalytics.importId, importId), inArray(inventoryAnalytics.branch, ANALYSIS_BRANCHES)];
  if (filters.branch) conditions.push(eq(inventoryAnalytics.branch, filters.branch));
  if (filters.curve) conditions.push(eq(inventoryAnalytics.curve, filters.curve));
  if (filters.productType) conditions.push(eq(inventoryAnalytics.productType, filters.productType));
  if (filters.mrp) conditions.push(eq(inventoryAnalytics.mrp, filters.mrp));
  if (filters.family) conditions.push(eq(inventoryAnalytics.family, filters.family));
  if (filters.subfamily) conditions.push(eq(inventoryAnalytics.subfamily, filters.subfamily));
  const whereClause = and(...conditions);
  const measures = {
    salesValue13M: sql<string>`coalesce(sum(${inventoryAnalytics.salesValue13M}), 0)`,
    stockValue: sql<string>`coalesce(sum(${inventoryAnalytics.stockValue}), 0)`,
    coverageDays: sql<string>`coalesce(sum(${inventoryAnalytics.coverageDays} * ${inventoryAnalytics.stockValue}) / nullif(sum(${inventoryAnalytics.stockValue}), 0), 0)`,
    excessValue: sql<string>`coalesce(sum(${inventoryAnalytics.excessValue}), 0)`,
  };
  const [byBranch, byCurve, byProductType, byMrp, byFamily, bySubfamily] = await Promise.all([
    db.select({ label: inventoryAnalytics.branch, ...measures }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.branch).orderBy(asc(inventoryAnalytics.branch)),
    db.select({ label: inventoryAnalytics.curve, ...measures }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.curve).orderBy(asc(inventoryAnalytics.curve)),
    db.select({ label: inventoryAnalytics.productType, ...measures }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.productType).orderBy(asc(inventoryAnalytics.productType)),
    db.select({ label: inventoryAnalytics.mrp, ...measures }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.mrp).orderBy(asc(inventoryAnalytics.mrp)),
    db.select({ label: inventoryAnalytics.family, ...measures }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.family).orderBy(asc(inventoryAnalytics.family)),
    db.select({ label: inventoryAnalytics.subfamily, ...measures }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.subfamily).orderBy(asc(inventoryAnalytics.subfamily)),
  ]);
  const mapGroup = (r: typeof byBranch[number]) => ({
    ...r,
    label: normalizeLabel(r.label),
    salesValue13M: asNumber(r.salesValue13M),
    stockValue: asNumber(r.stockValue),
    turnover: calculateTurnover(asNumber(r.salesValue13M), asNumber(r.stockValue)),
    coverageDays: asNumber(r.coverageDays),
    excessValue: asNumber(r.excessValue),
  });
  return {
    byBranch: byBranch.map(mapGroup),
    byCurve: byCurve.map(mapGroup),
    byProductType: byProductType.map(mapGroup),
    byMrp: byMrp.map(mapGroup),
    byFamily: byFamily.map(mapGroup),
    bySubfamily: bySubfamily.map(mapGroup),
  };
}
export async function getAnalyticsDashboard(filters: AnalyticsFilter) {
  const db = await getDb();
  if (!db) return null;
  const importId = await getLatestImportId(filters.importId);
  if (!importId) {
    return {
      currentImport: null,
      quality: { stockWithoutSalesValue: 0, lowCoverageStockValue: 0, excessStockValue: 0 },
      byBranch: [] as AnalyticsGroup[],
      byCurve: [] as AnalyticsGroup[],
      byProductType: [] as AnalyticsGroup[],
      byMrp: [] as AnalyticsGroup[],
      byFamily: [] as AnalyticsGroup[],
      bySubfamily: [] as AnalyticsGroup[],
    };
  }
  const [importRows, breakdown, qualityRows] = await Promise.all([
    db.select({ id: protheusImports.id, fileName: protheusImports.fileName, versionName: protheusImports.versionName, importedAt: protheusImports.importedAt }).from(protheusImports).where(eq(protheusImports.id, importId)).limit(1),
    getAnalyticsBreakdown({ ...filters, importId }),
    db.select({
      stockWithoutSalesValue: sql<string>`coalesce(sum(case when ${inventoryAnalytics.salesValue13M} = 0 then ${inventoryAnalytics.stockValue} else 0 end), 0)`,
      lowCoverageStockValue: sql<string>`coalesce(sum(case when ${inventoryAnalytics.coverageDays} < 30 and ${inventoryAnalytics.stockValue} > 0 then ${inventoryAnalytics.stockValue} else 0 end), 0)`,
      excessStockValue: sql<string>`coalesce(sum(${inventoryAnalytics.excessValue}), 0)`,
    }).from(inventoryAnalytics).where(and(eq(inventoryAnalytics.importId, importId), inArray(inventoryAnalytics.branch, ANALYSIS_BRANCHES))),
  ]);
  if (!breakdown) return null;
  const current = importRows[0] ?? null;
  return {
    currentImport: current ? { id: current.id, fileName: current.fileName, versionName: current.versionName, importedAt: current.importedAt } : null,
    quality: {
      stockWithoutSalesValue: asNumber(qualityRows[0]?.stockWithoutSalesValue),
      lowCoverageStockValue: asNumber(qualityRows[0]?.lowCoverageStockValue),
      excessStockValue: asNumber(qualityRows[0]?.excessStockValue),
    },
    ...breakdown,
  };
}
export async function getAnalyticsEvolution(filters: Omit<AnalyticsFilter, "importId">) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(protheusImports.status, "approved"), inArray(inventoryAnalytics.branch, ANALYSIS_BRANCHES)];
  if (filters.branch) conditions.push(eq(inventoryAnalytics.branch, filters.branch));
  if (filters.curve) conditions.push(eq(inventoryAnalytics.curve, filters.curve));
  if (filters.productType) conditions.push(eq(inventoryAnalytics.productType, filters.productType));
  if (filters.mrp) conditions.push(eq(inventoryAnalytics.mrp, filters.mrp));
  if (filters.family) conditions.push(eq(inventoryAnalytics.family, filters.family));
  if (filters.subfamily) conditions.push(eq(inventoryAnalytics.subfamily, filters.subfamily));
  const rows = await db
    .select({
      importId: protheusImports.id,
      fileName: protheusImports.fileName,
      versionName: protheusImports.versionName,
      importedAt: protheusImports.importedAt,
      salesValue13M: sql<string>`coalesce(sum(${inventoryAnalytics.salesValue13M}), 0)`,
      stockValue: sql<string>`coalesce(sum(${inventoryAnalytics.stockValue}), 0)`,
    })
    .from(inventoryAnalytics)
    .innerJoin(protheusImports, eq(inventoryAnalytics.importId, protheusImports.id))
    .where(and(...conditions))
    .groupBy(protheusImports.id, protheusImports.fileName, protheusImports.versionName, protheusImports.importedAt)
    .orderBy(asc(protheusImports.importedAt));
  return rows.map((row) => {
    const salesValue13M = asNumber(row.salesValue13M);
    const stockValue = asNumber(row.stockValue);
    return {
      importId: row.importId,
      fileName: row.fileName,
      importedAt: historicalImportDate(row.fileName, row.versionName, row.importedAt),
      salesValue13M,
      stockValue,
      turnover: calculateTurnover(salesValue13M, stockValue),
    };
  }).sort((left, right) => left.importedAt.getTime() - right.importedAt.getTime());
}
export async function getAnalyticsItems(filters: AnalyticsFilter, page = 1, pageSize = 50) {
  const db = await getDb();
  const importId = await getLatestImportId(filters.importId);
  if (!db || !importId) return { items: [] as AnalyticsItem[], total: 0, page, pageSize, importId: null };
  const conditions = [eq(inventoryAnalytics.importId, importId), inArray(inventoryAnalytics.branch, ANALYSIS_BRANCHES)];
  if (filters.branch) conditions.push(eq(inventoryAnalytics.branch, filters.branch));
  if (filters.curve) conditions.push(eq(inventoryAnalytics.curve, filters.curve));
  if (filters.productType) conditions.push(eq(inventoryAnalytics.productType, filters.productType));
  if (filters.mrp) conditions.push(eq(inventoryAnalytics.mrp, filters.mrp));
  if (filters.family) conditions.push(eq(inventoryAnalytics.family, filters.family));
  if (filters.subfamily) conditions.push(eq(inventoryAnalytics.subfamily, filters.subfamily));
  const whereClause = and(...conditions);
  const [countRow, rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(inventoryAnalytics).where(whereClause),
    db
      .select({
        id: inventoryAnalytics.id,
        code: inventoryAnalytics.code,
        description: inventoryAnalytics.description,
        branch: inventoryAnalytics.branch,
        productType: inventoryAnalytics.productType,
        mrp: inventoryAnalytics.mrp,
        family: inventoryAnalytics.family,
        subfamily: inventoryAnalytics.subfamily,
        curve: inventoryAnalytics.curve,
        sales13M: inventoryAnalytics.sales13M,
        salesValue13M: inventoryAnalytics.salesValue13M,
        stock: inventoryAnalytics.stock,
        stockValue: inventoryAnalytics.stockValue,
        coverageDays: inventoryAnalytics.coverageDays,
        excessValue: inventoryAnalytics.excessValue,
      })
      .from(inventoryAnalytics)
      .where(whereClause)
      .orderBy(asc(inventoryAnalytics.code), asc(inventoryAnalytics.branch))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);
  return {
    importId,
    page,
    pageSize,
    total: Number(countRow[0]?.total ?? 0),
    items: rows.map((row) => ({
      ...row,
      sales13M: asNumber(row.sales13M),
      salesValue13M: asNumber(row.salesValue13M),
      stock: asNumber(row.stock),
      stockValue: asNumber(row.stockValue),
      coverageDays: asNumber(row.coverageDays),
      excessValue: asNumber(row.excessValue),
      turnover: calculateTurnover(asNumber(row.salesValue13M), asNumber(row.stockValue)),
    })),
  };
}
export async function getAnalyticsFilterOptions(importId?: number) {
  const db = await getDb();
  const selectedImportId = await getLatestImportId(importId);
  if (!db || !selectedImportId)
    return {
      branches: [] as string[],
      curves: [] as Curve[],
      productTypes: [] as ProductType[],
      mrps: [] as ("Sim" | "Não")[],
      families: [] as string[],
      subfamilies: [] as string[],
    };
  const availableRecords = and(eq(inventoryAnalytics.importId, selectedImportId), inArray(inventoryAnalytics.branch, ANALYSIS_BRANCHES));
  const [branches, curves, productTypes, mrps, families, subfamilies] = await Promise.all([
    db.selectDistinct({ value: inventoryAnalytics.branch }).from(inventoryAnalytics).where(availableRecords).orderBy(asc(inventoryAnalytics.branch)),
    db.selectDistinct({ value: inventoryAnalytics.curve }).from(inventoryAnalytics).where(availableRecords).orderBy(asc(inventoryAnalytics.curve)),
    db.selectDistinct({ value: inventoryAnalytics.productType }).from(inventoryAnalytics).where(availableRecords).orderBy(asc(inventoryAnalytics.productType)),
    db.selectDistinct({ value: inventoryAnalytics.mrp }).from(inventoryAnalytics).where(availableRecords).orderBy(asc(inventoryAnalytics.mrp)),
    db.selectDistinct({ value: inventoryAnalytics.family }).from(inventoryAnalytics).where(availableRecords).orderBy(asc(inventoryAnalytics.family)),
    db.selectDistinct({ value: inventoryAnalytics.subfamily }).from(inventoryAnalytics).where(availableRecords).orderBy(asc(inventoryAnalytics.subfamily)),
  ]);
  return {
    branches: branches.map((row) => row.value),
    curves: curves.map((row) => row.value as Curve),
    productTypes: productTypes.map((row) => row.value as ProductType),
    mrps: mrps.map((row) => row.value as "Sim" | "Não"),
    families: families.map((row) => row.value),
    subfamilies: subfamilies.map((row) => row.value),
  };
}
export async function getReferenceCounts(): Promise<{ sb1: number; sbz: number; familias: number; subfamilias: number }> {
  const db = await getDb();
  if (!db) return { sb1: 0, sbz: 0, familias: 0, subfamilias: 0 };
  const [sb1, sbz, familias, subfamilias] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(sb1References),
    db.select({ n: sql<number>`count(*)::int` }).from(sbzReferences),
    db.select({ n: sql<number>`count(*)::int` }).from(familyReferences),
    db.select({ n: sql<number>`count(*)::int` }).from(subfamilyReferences),
  ]);
  return { sb1: sb1[0]?.n ?? 0, sbz: sbz[0]?.n ?? 0, familias: familias[0]?.n ?? 0, subfamilias: subfamilias[0]?.n ?? 0 };
}
export async function recordReferenceImport(kind: "sb1" | "sbz" | "familias" | "subfamilias", fileName: string, rowCount: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(referenceImports).values({ kind, fileName, rowCount });
}
export async function listReferenceImports() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(referenceImports).orderBy(desc(referenceImports.importedAt));
}
export async function deleteReferenceData(kind: "sb1" | "sbz" | "familias" | "subfamilias") {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  if (kind === "sb1") await db.delete(sb1References);
  else if (kind === "sbz") await db.delete(sbzReferences);
  else if (kind === "familias") await db.delete(familyReferences);
  else if (kind === "subfamilias") await db.delete(subfamilyReferences);
  await db.delete(referenceImports).where(eq(referenceImports.kind, kind));
}
export async function deleteProtheusImport(importId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(inventoryAnalytics).where(eq(inventoryAnalytics.importId, importId));
  await db.delete(protheusImports).where(eq(protheusImports.id, importId));
}