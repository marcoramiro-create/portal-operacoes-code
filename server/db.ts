import { and, asc, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  inventoryAnalytics,
  protheusImports,
  type InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { parseProtheusWorkbook } from "./protheusImport";
import { storagePut } from "./storage";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.role = values.role;
  updateSet.lastSignedIn = values.lastSignedIn;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listProtheusImports() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(protheusImports).orderBy(desc(protheusImports.importedAt));
}

export async function importProtheusWorkbook(fileName: string, fileBuffer: Buffer) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const records = parseProtheusWorkbook(fileBuffer);
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedFile = await storagePut(`protheus-imports/${Date.now()}-${safeFileName}`, fileBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  const importedAt = new Date();
  await db.transaction(async tx => {
    await tx.insert(protheusImports).values({
      fileName,
      fileKey: storedFile.key,
      rowCount: records.length,
      importedAt,
    });
    const createdImport = await tx.select({ id: protheusImports.id })
      .from(protheusImports)
      .where(eq(protheusImports.fileKey, storedFile.key))
      .limit(1);
    const importId = createdImport[0]?.id;
    if (!importId) throw new Error("Não foi possível registrar a importação.");

    const batchSize = 500;
    for (let start = 0; start < records.length; start += batchSize) {
      const batch = records.slice(start, start + batchSize).map(record => ({
        importId,
        code: record.code,
        description: record.description,
        branch: record.branch,
        curve: record.curve,
        sales13M: record.sales13M.toFixed(3),
        stock: record.stock.toFixed(3),
        coverageDays: record.coverageDays.toFixed(3),
        excessValue: record.excessValue.toFixed(2),
      }));
      await tx.insert(inventoryAnalytics).values(batch);
    }
  });

  return { rowCount: records.length, importedAt, fileName };
}

type AnalyticsFilter = { branch?: string; curve?: "A" | "B" | "C" | "D" | "E" };

async function getLatestImportId() {
  const db = await getDb();
  if (!db) return undefined;
  const latest = await db.select({ id: protheusImports.id }).from(protheusImports).orderBy(desc(protheusImports.importedAt)).limit(1);
  return latest[0]?.id;
}

function asNumber(value: unknown) {
  return Number(value ?? 0);
}

export async function getAnalyticsDashboard(filters: AnalyticsFilter) {
  const db = await getDb();
  const importId = await getLatestImportId();
  const empty = {
    currentImport: null,
    summary: { sales13M: 0, stock: 0, coverageDays: 0, excessValue: 0 },
    byBranch: [] as Array<{ branch: string; sales13M: number; stock: number; coverageDays: number; excessValue: number }>,
    byCurve: [] as Array<{ curve: "A" | "B" | "C" | "D" | "E"; sales13M: number; stock: number; coverageDays: number; excessValue: number }>,
  };
  if (!db || !importId) return empty;

  const [currentImport] = await db.select().from(protheusImports).where(eq(protheusImports.id, importId)).limit(1);
  const conditions = [eq(inventoryAnalytics.importId, importId)];
  if (filters.branch) conditions.push(eq(inventoryAnalytics.branch, filters.branch));
  if (filters.curve) conditions.push(eq(inventoryAnalytics.curve, filters.curve));
  const whereClause = and(...conditions);

  const [summary] = await db.select({
    sales13M: sql<string>`coalesce(sum(${inventoryAnalytics.sales13M}), 0)`,
    stock: sql<string>`coalesce(sum(${inventoryAnalytics.stock}), 0)`,
    coverageDays: sql<string>`coalesce(avg(${inventoryAnalytics.coverageDays}), 0)`,
    excessValue: sql<string>`coalesce(sum(${inventoryAnalytics.excessValue}), 0)`,
  }).from(inventoryAnalytics).where(whereClause);

  const byBranch = await db.select({
    branch: inventoryAnalytics.branch,
    sales13M: sql<string>`coalesce(sum(${inventoryAnalytics.sales13M}), 0)`,
    stock: sql<string>`coalesce(sum(${inventoryAnalytics.stock}), 0)`,
    coverageDays: sql<string>`coalesce(avg(${inventoryAnalytics.coverageDays}), 0)`,
    excessValue: sql<string>`coalesce(sum(${inventoryAnalytics.excessValue}), 0)`,
  }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.branch).orderBy(asc(inventoryAnalytics.branch));

  const byCurve = await db.select({
    curve: inventoryAnalytics.curve,
    sales13M: sql<string>`coalesce(sum(${inventoryAnalytics.sales13M}), 0)`,
    stock: sql<string>`coalesce(sum(${inventoryAnalytics.stock}), 0)`,
    coverageDays: sql<string>`coalesce(avg(${inventoryAnalytics.coverageDays}), 0)`,
    excessValue: sql<string>`coalesce(sum(${inventoryAnalytics.excessValue}), 0)`,
  }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.curve).orderBy(asc(inventoryAnalytics.curve));

  return {
    currentImport: currentImport ?? null,
    summary: {
      sales13M: asNumber(summary?.sales13M),
      stock: asNumber(summary?.stock),
      coverageDays: asNumber(summary?.coverageDays),
      excessValue: asNumber(summary?.excessValue),
    },
    byBranch: byBranch.map(row => ({ ...row, sales13M: asNumber(row.sales13M), stock: asNumber(row.stock), coverageDays: asNumber(row.coverageDays), excessValue: asNumber(row.excessValue) })),
    byCurve: byCurve.map(row => ({ ...row, curve: row.curve as "A" | "B" | "C" | "D" | "E", sales13M: asNumber(row.sales13M), stock: asNumber(row.stock), coverageDays: asNumber(row.coverageDays), excessValue: asNumber(row.excessValue) })),
  };
}

export async function getAnalyticsFilterOptions() {
  const db = await getDb();
  const importId = await getLatestImportId();
  if (!db || !importId) return { branches: [] as string[], curves: [] as Array<"A" | "B" | "C" | "D" | "E"> };

  const [branches, curves] = await Promise.all([
    db.selectDistinct({ value: inventoryAnalytics.branch }).from(inventoryAnalytics).where(eq(inventoryAnalytics.importId, importId)).orderBy(asc(inventoryAnalytics.branch)),
    db.selectDistinct({ value: inventoryAnalytics.curve }).from(inventoryAnalytics).where(eq(inventoryAnalytics.importId, importId)).orderBy(asc(inventoryAnalytics.curve)),
  ]);
  return { branches: branches.map(row => row.value), curves: curves.map(row => row.value as "A" | "B" | "C" | "D" | "E") };
}
