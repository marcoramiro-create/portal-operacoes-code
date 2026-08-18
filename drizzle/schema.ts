import { decimal, int, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 320 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

// Tabelas do primeiro fluxo operacional preservadas para evitar descarte destrutivo de dados já existentes.
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  contact: varchar("contact", { length: 200 }).notNull(),
  category: varchar("category", { length: 120 }).notNull(),
  deliveryLeadTime: int("deliveryLeadTime").notNull(),
  evaluation: decimal("evaluation", { precision: 4, scale: 1 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const purchaseOrders = mysqlTable("purchaseOrders", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplierId").notNull().references(() => suppliers.id),
  status: mysqlEnum("status", ["rascunho", "aprovado", "enviado", "recebido", "cancelado"]).default("rascunho").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const inventoryItems = mysqlTable("inventoryItems", {
  id: int("id").autoincrement().primaryKey(),
  item: varchar("item", { length: 200 }).notNull(),
  quantityAvailable: int("quantityAvailable").notNull(),
  reorderPoint: int("reorderPoint").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const stockMovements = mysqlTable("stockMovements", {
  id: int("id").autoincrement().primaryKey(),
  inventoryItemId: int("inventoryItemId").notNull().references(() => inventoryItems.id),
  type: mysqlEnum("type", ["entrada", "saida"]).notNull(),
  quantity: int("quantity").notNull(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
});

export const deliveries = mysqlTable("deliveries", {
  id: int("id").autoincrement().primaryKey(),
  purchaseOrderId: int("purchaseOrderId").notNull().references(() => purchaseOrders.id),
  expectedAt: timestamp("expectedAt").notNull(),
  actualAt: timestamp("actualAt"),
  status: mysqlEnum("status", ["pendente", "recebido"]).default("pendente").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const protheusImports = mysqlTable("protheusImports", {
  id: int("id").autoincrement().primaryKey(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  rowCount: int("rowCount").notNull(),
  importedAt: timestamp("importedAt").defaultNow().notNull(),
});

export const inventoryAnalytics = mysqlTable(
  "inventoryAnalytics",
  {
    id: int("id").autoincrement().primaryKey(),
    importId: int("importId").notNull().references(() => protheusImports.id),
    code: varchar("code", { length: 120 }).notNull(),
    description: varchar("description", { length: 1000 }).notNull(),
    branch: varchar("branch", { length: 24 }).notNull(),
    family: varchar("family", { length: 255 }).notNull().default(""),
    subfamily: varchar("subfamily", { length: 255 }).notNull().default(""),
    curve: mysqlEnum("curve", ["A", "B", "C", "D", "E"]).notNull(),
    sales13M: decimal("sales13M", { precision: 20, scale: 3 }).notNull(),
    salesValue13M: decimal("salesValue13M", { precision: 20, scale: 2 }).notNull().default("0"),
    stock: decimal("stock", { precision: 20, scale: 3 }).notNull(),
    coverageDays: decimal("coverageDays", { precision: 20, scale: 3 }).notNull(),
    excessValue: decimal("excessValue", { precision: 20, scale: 2 }).notNull(),
    capitalTurnover: decimal("capitalTurnover", { precision: 20, scale: 3 }).notNull().default("0"),
  },
  table => [uniqueIndex("inventoryAnalytics_import_code_branch_unique").on(table.importId, table.code, table.branch)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AnalyticsImport = typeof protheusImports.$inferSelect;
export type InventoryAnalytics = typeof inventoryAnalytics.$inferSelect;
