import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { inventoryAnalytics, protheusImports, type InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { calculateTurnover } from "./analyticsRules";
import { parseProtheusWorkbook } from "./protheusImport";
import { storagePut } from "./storage";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.SUPABASE_DATABASE_URL) {
    try {
      const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });
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
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  (["name", "email", "loginMethod"] as const).forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.role = values.role;
  updateSet.lastSignedIn = values.lastSignedIn;

  const existing = await db.select().from(users).where(eq(users.openId, user.openId)).limit(1);
  if (existing.length > 0) {
    await db.update(users).set(updateSet).where(eq(users.openId, user.openId));
  } else {
    await db.insert(users).values(values);
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
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
  if (!result.length) throw new Error("Versão de carga não encontrada.");
  return result[0];
}

export async function importProtheusWorkbook(fileName: string, fileBuffer: Buffer) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const records = parseProtheusWorkbook(fileBuffer);
  const importedAt = parsePurchaseHistoryDate(fileName);
  const versionName = fileName.replace(/.xlsx$/i, "");
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedFile = await storagePut(`protheus-imports/${Date.now()}-${safeFileName}`, fileBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  await db.transaction(async tx => {
    await tx.insert(protheusImports).values({ fileName, versionName, fileKey: storedFile.key, rowCount: records.length, importedAt });
    const createdImport = await tx.select({ id: protheusImports.id }).from(protheusImports).where(eq(protheusImports.fileKey, storedFile.key)).limit(1);
    const importId = createdImport[0]?.id;
    if (!importId) throw new Error("Não foi possível registrar a importação.");
    for (let start = 0; start < records.length; start += 500) {
      await tx.insert(inventoryAnalytics).values(records.slice(start, start + 500).map(record => ({
        importId,
        code: record.code,
        description: record.description,
        branch: record.branch,
        productType: record.productType,
        mrp: record.mrp,
        family: record.family,
        subfamily: record.subfamily,
        curve: record.curve,
        sales13M: record.sales13M,
        salesValue13M: record.salesValue13M,
        stock: record.stock,
        stockValue: record.stockValue,
        coverageDays: record.coverageDays,
        excessValue: record.excessValue,
      })));
    }
  });
  return { fileName, rowCount: records.length, importedAt };
}

async function getLatestImportId(selectedId?: number) {
  const db = await getDb();
  if (!db) return undefined;
  if (selectedId) return (await db.select({ id: protheusImports.id }).from(protheusImports).where(and(eq(protheusImports.id, selectedId), eq(protheusImports.status, "approved"))).limit(1))[0]?.id;
  return (await db.select({ id: protheusImports.id }).from(protheusImports).where(eq(protheusImports.status, "approved")).orderBy(desc(protheusImports.importedAt)).limit(1))[0]?.id;
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
  if (!match) throw new Error("O nome deve seguir o padrão Compras
