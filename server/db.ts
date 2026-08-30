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

const ANALYSIS_BRANCHES = ["0101", "0102", "0301", "0303"];

type AnalyticsFilter = {
  importId?: number;
  branch?: string;
  curve?: string;
  productType?: string;
  mrp?: string;
  family?: string;
  subfamily?: string;
};

type Curve = "A" | "B" | "C" | "D" | "E";
type ProductType = "ME" | "PE";
type StockQuality = { stockWithoutSalesValue: number; lowCoverageStockValue: number; excessStockValue: number };
type AnalyticsGroup = { label: string; salesValue13M: number; stockValue: number; turnover: number; coverageDays: number; excessValue: number };
type AnalyticsItem = {
  id: number; code: string; description: string; branch: string;
  productType: string; mrp: string; family: string; subfamily: string; curve: string;
  sales13M: number; salesValue13M: number; stock: number; stockValue: number;
  coverageDays: number; excessValue: number; turnover: number;
};

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
  if (!match) throw new Error("O nome deve seguir o padrão Compras - aaaaMMddHHmm.xlsx.");
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day) || date.getUTCHours() !== Number(hour) || date.getUTCMinutes() !== Number(minute)) {
    throw new Error("A data/hora no nome da planilha não é válida.");
  }
  return date;
}

function historicalImportDate(fileName: string, versionName: string, importedAt: Date) {
  try { return parsePurchaseHistoryDate(fileName); } catch {}
  try { return parsePurchaseHistoryDate(`${versionName}.xlsx`); } catch { return importedAt; }
}

export async function getAnalyticsDashboard(filters: AnalyticsFilter) {
  const db = await getDb();
  const importId = await getLatestImportId(filters.importId);
  const empty = {
    currentImport: null,
    summary: { salesValue13M: 0, stockValue: 0, turnover: 0, coverageDays: 0, excessValue: 0 },
    quality: { stockWithoutSalesValue: 0, lowCoverageStockValue: 0, excessStockValue: 0 } as StockQuality,
    byBranch: [] as AnalyticsGroup[],
    byCurve: [] as AnalyticsGroup[],
    byFamily: [] as AnalyticsGroup[],
    bySubfamily: [] as AnalyticsGroup[],
  };
  if (!db || !importId) return empty;
  const [currentImport] = await db.select().from(protheusImports).where(eq(protheusImports.id, importId)).limit(1);
  const currentImportWithHistory = currentImport
    ? { ...currentImport, importedAt: historicalImportDate(currentImport.fileName, currentImport.versionName, currentImport.importedAt) }
    : null;

  const conditions = [eq(inventoryAnalytics.importId, importId), inArray(inventoryAnalytics.branch, ANALYSIS_BRANCHES)];
  if (filters.branch) conditions.push(eq(inventoryAnalytics.branch, filters.branch));
  if (filters.curve) conditions.push(eq(inventoryAnalytics.curve, filters.curve as Curve));
  if (filters.productType) conditions.push(eq(inventoryAnalytics.productType, filters.productType as ProductType));
  if (filters.mrp) conditions.push(eq(inventoryAnalytics.mrp, filters.mrp as "Sim" | "Não"));
  if (filters.family) conditions.push(eq(inventoryAnalytics.family, filters.family));

  const [summary, branchRows, curveRows, familyRows, subfamilyRows] = await Promise.all([
    db.select({
      salesValue13M: sql<string>`coalesce(sum(${inventoryAnalytics.salesValue13M}), 0)`,
      stockValue: sql<string>`coalesce(sum(${inventoryAnalytics.stockValue}), 0)`,
      coverageDays: sql<string>`coalesce(avg(${inventoryAnalytics.coverageDays}), 0)`,
      excessValue: sql<string>`coalesce(sum(${inventoryAnalytics.excessValue}), 0)`,
      stockWithoutSalesValue: sql<string>`coalesce(sum(case when ${inventoryAnalytics.sales13M} = 0 then ${inventoryAnalytics.stockValue} else 0 end), 0)`,
      lowCoverageStockValue: sql<string>`coalesce(sum(case when ${inventoryAnalytics.coverageDays} < 30 then ${inventoryAnalytics.stockValue} else 0 end), 0)`,
    }).from(inventoryAnalytics).where(and(...conditions)),
    db.select({ label: inventoryAnalytics.branch, salesValue13M: sql<string>`coalesce(sum(${inventoryAnalytics.salesValue13M}), 0)`, stockValue: sql<string>`coalesce(sum(${inventoryAnalytics.stockValue}), 0)`, coverageDays: sql<string>`coalesce(avg(${inventoryAnalytics.coverageDays}), 0)`, excessValue: sql<string>`coalesce(sum(${inventoryAnalytics.excessValue}), 0)` }).from(inventoryAnalytics).where(and(...conditions)).groupBy(inventoryAnalytics.branch),
    db.select({ label: inventoryAnalytics.curve, salesValue13M: sql<string>`coalesce(sum(${inventoryAnalytics.salesValue13M}), 0)`, stockValue: sql<string>`coalesce(sum(${inventoryAnalytics.stockValue}), 0)`, coverageDays: sql<string>`coalesce(avg(${inventoryAnalytics.coverageDays}), 0)`, excessValue: sql<string>`coalesce(sum(${inventoryAnalytics.excessValue}), 0)` }).from(inventoryAnalytics).where(and(...conditions)).groupBy(inventoryAnalytics.curve),
    db.select({ label: inventoryAnalytics.family, salesValue13M: sql<string>`coalesce(sum(${inventoryAnalytics.salesValue13M}), 0)`, stockValue: sql<string>`coalesce(sum(${inventoryAnalytics.stockValue}), 0)`, coverageDays: sql<string>`coalesce(avg(${inventoryAnalytics.coverageDays}), 0)`, excessValue: sql<string>`coalesce(sum(${inventoryAnalytics.excessValue}), 0)` }).from(inventoryAnalytics).where(and(...conditions)).groupBy(inventoryAnalytics.family),
    db.select({ label: inventoryAnalytics.subfamily, salesValue13M: sql<string>`coalesce(sum(${inventoryAnalytics.salesValue13M}), 0)`, stockValue: sql<string>`coalesce(sum(${inventoryAnalytics.stockValue}), 0)`, coverageDays: sql<string>`coalesce(avg(${inventoryAnalytics.coverageDays}), 0)`, excessValue: sql<string>`coalesce(sum(${inventoryAnalytics.excessValue}), 0)` }).from(inventoryAnalytics).where(and(...conditions)).groupBy(inventoryAnalytics.subfamily),
  ]);

  const toGroups = (rows: typeof branchRows): AnalyticsGroup[] => rows.map(row => ({
    label: normalizeLabel(row.label),
    salesValue13M: asNumber(row.salesValue13M),
    stockValue: asNumber(row.stockValue),
    turnover: calculateTurnover(asNumber(row.salesValue13M), asNumber(row.stockValue)),
    coverageDays: asNumber(row.coverageDays),
    excessValue: asNumber(row.excessValue),
  }));

  return {
    currentImport: currentImportWithHistory,
    summary: {
      salesValue13M: asNumber(summary[0]?.salesValue13M),
      stockValue: asNumber(summary[0]?.stockValue),
      turnover: calculateTurnover(asNumber(summary[0]?.salesValue13M), asNumber(summary[0]?.stockValue)),
      coverageDays: asNumber(summary[0]?.coverageDays),
      excessValue: asNumber(summary[0]?.excessValue),
    },
    quality: {
      stockWithoutSalesValue: asNumber(summary[0]?.stockWithoutSalesValue),
      lowCoverageStockValue: asNumber(summary[0]?.lowCoverageStockValue),
      excessStockValue: asNumber(summary[0]?.excessValue),
    },
    byBranch: toGroups(branchRows),
    byCurve: toGroups(curveRows),
    byFamily: toGroups(familyRows),
    bySubfamily: toGroups(subfamilyRows),
  };
}

export async function getAnalyticsEvolution(filters: Omit<AnalyticsFilter, "importId">) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(protheusImports.status, "approved"), inArray(inventoryAnalytics.branch, ANALYSIS_BRANCHES)];
  if (filters.branch) conditions.push(eq(inventoryAnalytics.branch, filters.branch));
  if (filters.curve) conditions.push(eq(inventoryAnalytics.curve, filters.curve as Curve));
  if (filters.productType) conditions.push(eq(inventoryAnalytics.productType, filters.productType as ProductType));
  if (filters.mrp) conditions.push(eq(inventoryAnalytics.mrp, filters.mrp as "Sim" | "Não"));
  if (filters.family) conditions.push(eq(inventoryAnalytics.family, filters.family));
  if (filters.subfamily) conditions.push(eq(inventoryAnalytics.subfamily, filters.subfamily));

  const rows = await db.select({
    importId: protheusImports.id,
    fileName: protheusImports.fileName,
    versionName: protheusImports.versionName,
    importedAt: protheusImports.importedAt,
    salesValue13M: sql<string>`coalesce(sum(${inventoryAnalytics.salesValue13M}), 0)`,
    stockValue: sql<string>`coalesce(sum(${inventoryAnalytics.stockValue}), 0)`,
  }).from(inventoryAnalytics).innerJoin(protheusImports, eq(inventoryAnalytics.importId, protheusImports.id)).where(and(...conditions)).groupBy(protheusImports.id, protheusImports.fileName, protheusImports.versionName, protheusImports.importedAt).orderBy(asc(protheusImports.importedAt));

  return rows.map(row => {
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
  if (filters.curve) conditions.push(eq(inventoryAnalytics.curve, filters.curve as Curve));
  if (filters.productType) conditions.push(eq(inventoryAnalytics.productType, filters.productType as ProductType));
  if (filters.mrp) conditions.push(eq(inventoryAnalytics.mrp, filters.mrp as "Sim" | "Não"));
  if (filters.family) conditions.push(eq(inventoryAnalytics.family, filters.family));
  if (filters.subfamily) conditions.push(eq(inventoryAnalytics.subfamily, filters.subfamily));

  const whereClause = and(...conditions);
  const [countRow, rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(inventoryAnalytics).where(whereClause),
    db.select({
      id: inventoryAnalytics.id, code: inventoryAnalytics.code, description: inventoryAnalytics.description, branch: inventoryAnalytics.branch, productType: inventoryAnalytics.productType, mrp: inventoryAnalytics.mrp, family: inventoryAnalytics.family, subfamily: inventoryAnalytics.subfamily, curve: inventoryAnalytics.curve, sales13M: inventoryAnalytics.sales13M, salesValue13M: inventoryAnalytics.salesValue13M, stock: inventoryAnalytics.stock, stockValue: inventoryAnalytics.stockValue, coverageDays: inventoryAnalytics.coverageDays, excessValue: inventoryAnalytics.excessValue,
    }).from(inventoryAnalytics).where(whereClause).orderBy(asc(inventoryAnalytics.code), asc(inventoryAnalytics.branch)).limit(pageSize).offset((page - 1) * pageSize),
  ]);

  return {
    total: Number(countRow[0]?.total ?? 0),
    page,
    pageSize,
    importId,
    items: rows.map(row => ({
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
  if (!db || !selectedImportId) return { branches: [] as string[], curves: [] as Curve[], productTypes: [] as ProductType[], mrps: [] as ("Sim" | "Não")[], families: [] as string[], subfamilies: [] as string[] };

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
    branches: branches.map(row => row.value),
    curves: curves.map(row => row.value as Curve),
    productTypes: productTypes.map(row => row.value as ProductType),
    mrps: mrps.map(row => row.value as "Sim" | "Não"),
    families: families.map(row => row.value),
    subfamilies: subfamilies.map(row => row.value),
  };
}
