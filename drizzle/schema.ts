import { date, decimal, integer, pgEnum, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 320 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: pgEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const inventoryItems = pgTable("inventoryItems", {
  id: serial("id").primaryKey(),
  item: varchar("item", { length: 200 }).notNull(),
  quantityAvailable: integer("quantityAvailable").notNull(),
  reorderPoint: integer("reorderPoint").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const stockMovements = pgTable("stockMovements", {
  id: serial("id").primaryKey(),
  inventoryItemId: integer("inventoryItemId").notNull().references(() => inventoryItems.id),
  type: varchar("type", { length: 10 }).notNull(),
  quantity: integer("quantity").notNull(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
});

export const protheusImports = pgTable("protheusImports", {
  id: serial("id").primaryKey(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  versionName: varchar("versionName", { length: 32 }).notNull().default("Compras - legado"),
  status: pgEnum("protheus_status", ["pending", "approved", "archived"]).notNull().default("pending"),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  rowCount: integer("rowCount").notNull(),
  importedAt: timestamp("importedAt").defaultNow().notNull(),
});

export const inventoryAnalytics = pgTable(
  "inventoryAnalytics",
  {
    id: serial("id").primaryKey(),
    importId: integer("importId").notNull().references(() => protheusImports.id),
    code: varchar("code", { length: 120 }).notNull(),
    description: varchar("description", { length: 1000 }).notNull(),
    branch: varchar("branch", { length: 24 }).notNull(),
    productType: pgEnum("product_type", ["ME", "PE"]).notNull().default("ME"),
    mrp: pgEnum("mrp", ["Sim", "Não"]).notNull().default("Não"),
    family: varchar("family", { length: 255 }).notNull().default(""),
    subfamily: varchar("subfamily", { length: 255 }).notNull().default(""),
    curve: pgEnum("curve", ["A", "B", "C", "D", "E"]).notNull(),
    sales13M: decimal("sales13M", { precision: 20, scale: 3 }).notNull(),
    salesValue13M: decimal("salesValue13M", { precision: 20, scale: 2 }).notNull().default("0"),
    stock: decimal("stock", { precision: 20, scale: 3 }).notNull(),
    stockValue: decimal("stockValue", { precision: 20, scale: 2 }).notNull().default("0"),
    coverageDays: decimal("coverageDays", { precision: 20, scale: 3 }).notNull(),
    excessValue: decimal("excessValue", { precision: 20, scale: 2 }).notNull(),
    capitalTurnover: decimal("capitalTurnover", { precision: 20, scale: 3 }).notNull().default("0"),
  },
  table => [
    uniqueIndex("inventoryAnalytics_import_code_branch_unique").on(table.importId, table.code, table.branch),
  ],
);

export const costEvolutionImports = pgTable("costEvolutionImports", {
  id: serial("id").primaryKey(),
  segment: pgEnum("segment", ["auto_parts", "industry"]).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  status: pgEnum("cost_evolution_status", ["pending", "approved", "archived"]).notNull().default("pending"),
  itemCount: integer("itemCount").notNull(),
  observationCount: integer("observationCount").notNull(),
  periodStart: date("periodStart").notNull(),
  periodEnd: date("periodEnd").notNull(),
  importedBy: varchar("importedBy", { length: 320 }).notNull(),
  importedAt: timestamp("importedAt").defaultNow().notNull(),
});

export const costEvolutionItems = pgTable(
  "costEvolutionItems",
  {
    id: serial("id").primaryKey(),
    importId: integer("importId").notNull().references(() => costEvolutionImports.id),
    branch: varchar("branch", { length: 24 }).notNull(),
    aggregateCode: varchar("aggregateCode", { length: 120 }).notNull(),
    code: varchar("code", { length: 120 }).notNull(),
    mrp: pgEnum("cost_evolution_mrp", ["Sim", "Não"]).notNull().default("Não"),
    description: varchar("description", { length: 1000 }).notNull(),
    buyer: varchar("buyer", { length: 320 }).notNull().default(""),
    lastPurchaseDate: date("lastPurchaseDate"),
    lastPurchasePrice: decimal("lastPurchasePrice", { precision: 20, scale: 6 }),
  },
  table => [
    uniqueIndex("costEvolutionItems_import_business_key_unique").on(table.importId, table.branch, table.aggregateCode, table.code),
  ],
);

export const costEvolutionObservations = pgTable(
  "costEvolutionObservations",
  {
    id: serial("id").primaryKey(),
    itemId: integer("itemId").notNull().references(() => costEvolutionItems.id),
    balanceDate: date("balanceDate").notNull(),
    cost: decimal("cost", { precision: 20, scale: 6 }).notNull(),
  },
  table => [
    uniqueIndex("costEvolutionObservations_item_date_unique").on(table.itemId, table.balanceDate),
  ],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AnalyticsImport = typeof protheusImports.$inferSelect;
export type InventoryAnalytics = typeof inventoryAnalytics.$inferSelect;
export type CostEvolutionImport = typeof costEvolutionImports.$inferSelect;
export type CostEvolutionItem = typeof costEvolutionItems.$inferSelect;
export type CostEvolutionObservation = typeof costEvolutionObservations.$inferSelect;
