import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { inventoryAnalytics, protheusImports, type InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { calculateTurnover } from "./analyticsRules";
import { parseProtheusWorkbook } from "./protheusImport";
import { storagePut } from "./storage";

let _db: ReturnType<typeof drizzle> | null = null;

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

  const records = parseProtheusWorkbook(fileBuffer);
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
        rowCount: records.length,
        importedAt,
      })
      .returning({ id: protheusImports.id });

    const importId = createdImport?.id;
    if (!importId) throw new Error("Não foi possível registrar a importação.");

    for (let start = 0; start < records.length; start += 500) {
      await tx.insert(inventoryAnalytics).values(
        records.slice(start, start + 500).map((record) => ({
          importId,
          code: record.code,
          description: record.description,
          branch: record.branch,
          productType: record.productType,
          mrp: record.mrp,
          family: record.family,
          subfamily: record.subfamily,
          curve: record.curve,
          sales13M: record.sales13M.toFixed(3),
          salesValue13M: record.salesValue13M.toFixed(2),
          stock: record.stock.toFixed(3),
          stockValue: record.stockValue.toFixed(2),
          coverageDays: record.coverageDays.toFixed(3),
          excessValue: record.excessValue.toFixed(2),
        }))
      );
    }

    return { id: importId, rowCount: records.length };
  });
}

// ─── Funções de consulta (queries) ───

function parsePurchaseHistoryDate(fileName: string): Date {
  const match = fileName.match(/(\d{12})/);
  if (match) {
    const str = match[1];
    const year = Number(str.slice(0, 4));
    const month = Number(str.slice(4, 6));
    const day = Number(str.slice(6, 8));
    const hour = Number(str.slice(8, 10));
    const minute = Number(str.slice(10, 12));
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

function historicalImportDate(fileName: string, versionName: string, importedAt: Date): Date {
  const fromName = parsePurchaseHistoryDate(fileName);
  if (!Number.isNaN(fromName.getTime())) return fromName;
  const fromVersion = parsePurchaseHistoryDate(versionName);
  if (!Number.isNaN(fromVersion.getTime())) return fromVersion;
  return importedAt;
}

const ANALYSIS_BRANCHES = ["0101", "0102", "0301", "0303"];

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
    coverageDays: sql<string>`coalesce(avg(${inventoryAnalytics.coverageDays}), 0)`,
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
    coverageDays: sql<string>`coalesce(avg(${inventoryAnalytics.coverageDays}), 0)`,
    excessValue: sql<string>`coalesce(sum(${inventoryAnalytics.excessValue}), 0)`,
  };

  const [byBranch, byCurve, byProductType, byMrp, byFamily] = await Promise.all([
    db.select({ label: inventoryAnalytics.branch, ...measures }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.branch).orderBy(asc(inventoryAnalytics.branch)),
    db.select({ label: inventoryAnalytics.curve, ...measures }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.curve).orderBy(asc(inventoryAnalytics.curve)),
    db.select({ label: inventoryAnalytics.productType, ...measures }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.productType).orderBy(asc(inventoryAnalytics.productType)),
    db.select({ label: inventoryAnalytics.mrp, ...measures }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.mrp).orderBy(asc(inventoryAnalytics.mrp)),
    db.select({ label: inventoryAnalytics.family, ...measures }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.family).orderBy(asc(inventoryAnalytics.family)),
  ]);

  return {
    byBranch: byBranch.map((r) => ({ ...r, label: normalizeLabel(r.label) })),
    byCurve: byCurve.map((r) => ({ ...r, label: normalizeLabel(r.label) })),
    byProductType: byProductType.map((r) => ({ ...r, label: normalizeLabel(r.label) })),
    byMrp: byMrp.map((r) => ({ ...r, label: normalizeLabel(r.label) })),
    byFamily: byFamily.map((r) => ({ ...r, label: normalizeLabel(r.label) })),
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
export async function getAnalyticsDashboard(filters: AnalyticsFilter) {
  const db = await getDb();
  if (!db) return null;
  const [summary, breakdown] = await Promise.all([
    getAnalyticsSummary(filters),
    getAnalyticsBreakdown(filters),
  ]);
  if (!summary || !breakdown) return null;
  return { summary, breakdown };
}
