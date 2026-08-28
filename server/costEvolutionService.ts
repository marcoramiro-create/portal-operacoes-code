import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { costEvolutionImports, costEvolutionItems, costEvolutionObservations } from "../drizzle/schema";
import { getDb } from "./db";
import { parseCostEvolutionWorkbook, type CostEvolutionSegment } from "./costEvolution";
import { storagePut } from "./storage";

export type CostEvolutionFilters = {
  segment: CostEvolutionSegment;
  branch?: string;
  mrp?: "Sim" | "Não";
  buyer?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

const asNumber = (value: unknown) => value === null || value === undefined ? null : Number(value);
const asBusinessDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function latestApprovedImport(segment: CostEvolutionSegment) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(costEvolutionImports)
    .where(and(eq(costEvolutionImports.segment, segment), eq(costEvolutionImports.status, "approved")))
    .orderBy(desc(costEvolutionImports.importedAt), desc(costEvolutionImports.id)).limit(1))[0];
}

export async function commitCostEvolutionImport(input: { fileName: string; contentBase64: string; segment: CostEvolutionSegment; importedBy: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const buffer = Buffer.from(input.contentBase64, "base64");
  const parsed = parseCostEvolutionWorkbook(input.fileName, buffer, input.segment);
  if (parsed.issues.length) throw new Error(`A planilha contém ${parsed.issues.length} erro(s) de validação. Revise a prévia antes de confirmar.`);
  if (!parsed.rows.length) throw new Error("A planilha não contém itens válidos para importação.");
  const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const stored = await storagePut(`cost-evolution/${input.segment}/${Date.now()}-${safeFileName}`, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  return db.transaction(async tx => {
    await tx.insert(costEvolutionImports).values({
      segment: input.segment,
      fileName: input.fileName,
      fileKey: stored.key,
      status: "pending",
      itemCount: parsed.itemCount,
      observationCount: parsed.observationCount,
      periodStart: asBusinessDate(parsed.periodStart),
      periodEnd: asBusinessDate(parsed.periodEnd),
      importedBy: input.importedBy,
    });
    const created = (await tx.select().from(costEvolutionImports).where(eq(costEvolutionImports.fileKey, stored.key)).limit(1))[0];
    if (!created) throw new Error("Não foi possível registrar a versão de custos.");

    for (let start = 0; start < parsed.rows.length; start += 500) {
      await tx.insert(costEvolutionItems).values(parsed.rows.slice(start, start + 500).map(row => ({
        importId: created.id,
        branch: row.branch,
        aggregateCode: row.aggregateCode,
        code: row.code,
        mrp: row.mrp,
        description: row.description,
        buyer: row.buyer,
        lastPurchaseDate: row.lastPurchaseDate ? asBusinessDate(row.lastPurchaseDate) : null,
        lastPurchasePrice: row.lastPurchasePrice === null ? null : row.lastPurchasePrice.toFixed(6),
      })));
    }

    const savedItems = await tx.select({ id: costEvolutionItems.id, branch: costEvolutionItems.branch, aggregateCode: costEvolutionItems.aggregateCode, code: costEvolutionItems.code })
      .from(costEvolutionItems).where(eq(costEvolutionItems.importId, created.id));
    const itemIds = new Map(savedItems.map(row => [`${row.branch}\u0000${row.aggregateCode}\u0000${row.code}`, row.id]));
    const observations = parsed.rows.flatMap(row => {
      const itemId = itemIds.get(`${row.branch}\u0000${row.aggregateCode}\u0000${row.code}`);
      if (!itemId) throw new Error(`Item não persistido: ${row.branch}/${row.code}.`);
      return row.observations.map(observation => ({ itemId, balanceDate: asBusinessDate(observation.balanceDate), cost: observation.cost.toFixed(6) }));
    });
    for (let start = 0; start < observations.length; start += 1000) await tx.insert(costEvolutionObservations).values(observations.slice(start, start + 1000));
    return { id: created.id, status: created.status, fileName: created.fileName, itemCount: parsed.itemCount, observationCount: parsed.observationCount, periodStart: parsed.periodStart, periodEnd: parsed.periodEnd };
  });
}

export async function listCostEvolutionImports(segment: CostEvolutionSegment) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(costEvolutionImports).where(eq(costEvolutionImports.segment, segment)).orderBy(desc(costEvolutionImports.importedAt), desc(costEvolutionImports.id));
}

export async function updateCostEvolutionImportStatus(id: number, status: "approved" | "archived") {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const current = (await db.select().from(costEvolutionImports).where(eq(costEvolutionImports.id, id)).limit(1))[0];
  if (!current) throw new Error("Versão de custos não encontrada.");
  await db.transaction(async tx => {
    if (status === "approved") await tx.update(costEvolutionImports).set({ status: "archived" }).where(and(eq(costEvolutionImports.segment, current.segment), eq(costEvolutionImports.status, "approved")));
    await tx.update(costEvolutionImports).set({ status }).where(eq(costEvolutionImports.id, id));
  });
  return { success: true as const };
}

function itemConditions(importId: number, filters: CostEvolutionFilters) {
  const conditions = [eq(costEvolutionItems.importId, importId)];
  if (filters.branch) conditions.push(eq(costEvolutionItems.branch, filters.branch));
  if (filters.mrp) conditions.push(eq(costEvolutionItems.mrp, filters.mrp));
  if (filters.buyer) conditions.push(eq(costEvolutionItems.buyer, filters.buyer));
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    const search = or(like(costEvolutionItems.code, term), like(costEvolutionItems.aggregateCode, term), like(costEvolutionItems.description, term));
    if (search) conditions.push(search);
  }
  return conditions;
}

export async function getCostEvolutionFilterOptions(segment: CostEvolutionSegment) {
  const db = await getDb();
  const current = await latestApprovedImport(segment);
  if (!db || !current) return { currentImport: null, branches: [] as string[], buyers: [] as string[], mrps: [] as ("Sim" | "Não")[] };
  const [branches, buyers, mrps] = await Promise.all([
    db.selectDistinct({ value: costEvolutionItems.branch }).from(costEvolutionItems).where(eq(costEvolutionItems.importId, current.id)).orderBy(asc(costEvolutionItems.branch)),
    db.selectDistinct({ value: costEvolutionItems.buyer }).from(costEvolutionItems).where(eq(costEvolutionItems.importId, current.id)).orderBy(asc(costEvolutionItems.buyer)),
    db.selectDistinct({ value: costEvolutionItems.mrp }).from(costEvolutionItems).where(eq(costEvolutionItems.importId, current.id)).orderBy(asc(costEvolutionItems.mrp)),
  ]);
  return { currentImport: current, branches: branches.map(row => row.value), buyers: buyers.map(row => row.value).filter(Boolean), mrps: mrps.map(row => row.value) };
}

export async function getCostEvolutionItems(filters: CostEvolutionFilters) {
  const db = await getDb();
  const current = await latestApprovedImport(filters.segment);
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 50));
  if (!db || !current) return { currentImport: null, page, pageSize, total: 0, items: [] };
  const where = and(...itemConditions(current.id, filters));
  const [countResult, items] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(costEvolutionItems).where(where),
    db.select().from(costEvolutionItems).where(where).orderBy(asc(costEvolutionItems.code), asc(costEvolutionItems.branch)).limit(pageSize).offset((page - 1) * pageSize),
  ]);
  const ids = items.map(item => item.id);
  const observations = ids.length ? await db.select().from(costEvolutionObservations)
    .where(sql`${costEvolutionObservations.itemId} in (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`)
    .orderBy(asc(costEvolutionObservations.balanceDate)) : [];
  const byItem = new Map<number, typeof observations>();
  observations.forEach(observation => byItem.set(observation.itemId, [...(byItem.get(observation.itemId) ?? []), observation]));
  return {
    currentImport: current,
    page,
    pageSize,
    total: Number(countResult[0]?.total ?? 0),
    items: items.map(item => {
      const series = byItem.get(item.id) ?? [];
      const first = asNumber(series[0]?.cost);
      const last = asNumber(series.at(-1)?.cost);
      const variation = first && last !== null ? ((last - first) / first) * 100 : null;
      return { ...item, lastPurchasePrice: asNumber(item.lastPurchasePrice), firstCost: first, lastCost: last, variation, observations: series.map(observation => ({ balanceDate: observation.balanceDate, cost: Number(observation.cost) })) };
    }),
  };
}

export async function getCostEvolutionSummary(filters: CostEvolutionFilters) {
  const db = await getDb();
  const current = await latestApprovedImport(filters.segment);
  if (!db || !current) return { currentImport: null, itemCount: 0, observationCount: 0, latestAverageCost: 0 };
  const whereItems = and(...itemConditions(current.id, filters));
  const filteredIds = db.select({ id: costEvolutionItems.id }).from(costEvolutionItems).where(whereItems);
  const [items, latest] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(costEvolutionItems).where(whereItems),
    db.select({ count: sql<number>`count(*)`, average: sql<string>`coalesce(avg(${costEvolutionObservations.cost}), 0)` }).from(costEvolutionObservations)
      .where(and(eq(costEvolutionObservations.balanceDate, current.periodEnd), sql`${costEvolutionObservations.itemId} in (${filteredIds})`)),
  ]);
  return { currentImport: current, itemCount: Number(items[0]?.total ?? 0), observationCount: Number(latest[0]?.count ?? 0), latestAverageCost: Number(latest[0]?.average ?? 0) };
}
