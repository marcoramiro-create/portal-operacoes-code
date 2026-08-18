import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { inventoryAnalytics, protheusImports, type InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { parseProtheusWorkbook } from "./protheusImport";
import { storagePut } from "./storage";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  (["name", "email", "loginMethod"] as const).forEach(field => { if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; } });
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.role = values.role;
  updateSet.lastSignedIn = values.lastSignedIn;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
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
    await tx.insert(protheusImports).values({ fileName, fileKey: storedFile.key, rowCount: records.length, importedAt });
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
        family: record.family,
        subfamily: record.subfamily,
        curve: record.curve,
        sales13M: record.sales13M.toFixed(3),
        salesValue13M: record.salesValue13M.toFixed(2),
        stock: record.stock.toFixed(3),
        stockValue: record.stockValue.toFixed(2),
        coverageDays: record.coverageDays.toFixed(3),
        excessValue: record.excessValue.toFixed(2),
        capitalTurnover: record.capitalTurnover.toFixed(3),
      })));
    }
  });
  return { rowCount: records.length, importedAt, fileName };
}

type Curve = "A" | "B" | "C" | "D" | "E";
type ProductType = "ME" | "PE";
const ANALYSIS_BRANCHES = ["0101", "0102", "0301", "0303"] as const;
export type AnalyticsFilter = { branch?: string; curve?: Curve; productType?: ProductType; family?: string; subfamily?: string };
type AnalyticsGroup = { label: string; salesValue13M: number; stockValue: number; capitalTurnover: number; coverageDays: number; excessValue: number };

async function getLatestImportId() {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select({ id: protheusImports.id }).from(protheusImports).orderBy(desc(protheusImports.importedAt)).limit(1))[0]?.id;
}
const asNumber = (value: unknown) => Number(value ?? 0);
const normalizeLabel = (value: string) => value || "Não informado";

export async function getAnalyticsDashboard(filters: AnalyticsFilter) {
  const db = await getDb();
  const importId = await getLatestImportId();
  const empty = { currentImport: null, summary: { salesValue13M: 0, stockValue: 0, capitalTurnover: 0, coverageDays: 0, excessValue: 0 }, byBranch: [] as AnalyticsGroup[], byCurve: [] as AnalyticsGroup[], byFamily: [] as AnalyticsGroup[], bySubfamily: [] as AnalyticsGroup[] };
  if (!db || !importId) return empty;
  const [currentImport] = await db.select().from(protheusImports).where(eq(protheusImports.id, importId)).limit(1);
  const conditions = [eq(inventoryAnalytics.importId, importId), inArray(inventoryAnalytics.branch, ANALYSIS_BRANCHES)];
  if (filters.branch) conditions.push(eq(inventoryAnalytics.branch, filters.branch));
  if (filters.curve) conditions.push(eq(inventoryAnalytics.curve, filters.curve));
  if (filters.productType) conditions.push(eq(inventoryAnalytics.productType, filters.productType));
  if (filters.family) conditions.push(eq(inventoryAnalytics.family, filters.family));
  if (filters.subfamily) conditions.push(eq(inventoryAnalytics.subfamily, filters.subfamily));
  const whereClause = and(...conditions);
  const measures = {
    salesValue13M: sql<string>`coalesce(sum(${inventoryAnalytics.salesValue13M}), 0)`,
    stockValue: sql<string>`coalesce(sum(${inventoryAnalytics.stockValue}), 0)`,
    capitalTurnover: sql<string>`coalesce(avg(${inventoryAnalytics.capitalTurnover}), 0)`,
    coverageDays: sql<string>`coalesce(avg(${inventoryAnalytics.coverageDays}), 0)`,
    excessValue: sql<string>`coalesce(sum(${inventoryAnalytics.excessValue}), 0)`,
  };
  const [summary] = await db.select(measures).from(inventoryAnalytics).where(whereClause);
  const toGroups = (rows: Array<{ label: string; salesValue13M: string; stockValue: string; capitalTurnover: string; coverageDays: string; excessValue: string }>) => rows.map(row => ({ label: normalizeLabel(row.label), salesValue13M: asNumber(row.salesValue13M), stockValue: asNumber(row.stockValue), capitalTurnover: asNumber(row.capitalTurnover), coverageDays: asNumber(row.coverageDays), excessValue: asNumber(row.excessValue) }));
  const [branchRows, curveRows, familyRows, subfamilyRows] = await Promise.all([
    db.select({ label: inventoryAnalytics.branch, ...measures }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.branch).orderBy(asc(inventoryAnalytics.branch)),
    db.select({ label: inventoryAnalytics.curve, ...measures }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.curve).orderBy(asc(inventoryAnalytics.curve)),
    db.select({ label: inventoryAnalytics.family, ...measures }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.family).orderBy(desc(sql`sum(${inventoryAnalytics.salesValue13M})`)),
    db.select({ label: inventoryAnalytics.subfamily, ...measures }).from(inventoryAnalytics).where(whereClause).groupBy(inventoryAnalytics.subfamily).orderBy(desc(sql`sum(${inventoryAnalytics.salesValue13M})`)),
  ]);
  return { currentImport: currentImport ?? null, summary: { salesValue13M: asNumber(summary?.salesValue13M), stockValue: asNumber(summary?.stockValue), capitalTurnover: asNumber(summary?.capitalTurnover), coverageDays: asNumber(summary?.coverageDays), excessValue: asNumber(summary?.excessValue) }, byBranch: toGroups(branchRows), byCurve: toGroups(curveRows), byFamily: toGroups(familyRows), bySubfamily: toGroups(subfamilyRows) };
}

export async function getAnalyticsFilterOptions() {
  const db = await getDb();
  const importId = await getLatestImportId();
  if (!db || !importId) return { branches: [] as string[], curves: [] as Curve[], productTypes: [] as ProductType[], families: [] as string[], subfamilies: [] as string[] };
  const availableRecords = and(eq(inventoryAnalytics.importId, importId), inArray(inventoryAnalytics.branch, ANALYSIS_BRANCHES));
  const [branches, curves, productTypes, families, subfamilies] = await Promise.all([
    db.selectDistinct({ value: inventoryAnalytics.branch }).from(inventoryAnalytics).where(availableRecords).orderBy(asc(inventoryAnalytics.branch)),
    db.selectDistinct({ value: inventoryAnalytics.curve }).from(inventoryAnalytics).where(availableRecords).orderBy(asc(inventoryAnalytics.curve)),
    db.selectDistinct({ value: inventoryAnalytics.productType }).from(inventoryAnalytics).where(availableRecords).orderBy(asc(inventoryAnalytics.productType)),
    db.selectDistinct({ value: inventoryAnalytics.family }).from(inventoryAnalytics).where(availableRecords).orderBy(asc(inventoryAnalytics.family)),
    db.selectDistinct({ value: inventoryAnalytics.subfamily }).from(inventoryAnalytics).where(availableRecords).orderBy(asc(inventoryAnalytics.subfamily)),
  ]);
  return { branches: branches.map(row => row.value), curves: curves.map(row => row.value as Curve), productTypes: productTypes.map(row => row.value as ProductType), families: families.map(row => row.value), subfamilies: subfamilies.map(row => row.value) };
}
