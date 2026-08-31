import { date, decimal, integer, pgEnum, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", ["rascunho", "aprovado", "enviado", "recebido", "cancelado"]);
export const stockMovementTypeEnum = pgEnum("stock_movement_type", ["entrada", "saida"]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["pendente", "recebido"]);
export const protheusImportStatusEnum = pgEnum("protheus_import_status", ["pending", "approved", "archived"]);
export const productTypeEnum = pgEnum("product_type", ["ME", "PE"]);
export const mrpEnum = pgEnum("mrp_status", ["Sim", "Não"]);
export const curveEnum = pgEnum("curve_class", ["A", "B", "C", "D", "E"]);
export const costEvolutionSegmentEnum = pgEnum("cost_evolution_segment", ["auto_parts", "industry"]);
export const costEvolutionStatusEnum = pgEnum("cost_evolution_status", ["pending", "approved", "archived"]);

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 320 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const suppliers = pgTable("suppliers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 200 }).notNull(),
  contact: varchar("contact", { length: 200 }).notNull(),
  category: varchar("category", { length: 120 }).notNull(),
  deliveryLeadTime: integer("deliveryLeadTime").notNull(),
  evaluation: decimal("evaluation", { precision: 4, scale: 1 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const purchaseOrders = pgTable("purchaseOrders", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  supplierId: integer("supplierId").notNull().references(() => suppliers.id),
  status: purchaseOrderStatusEnum("status").default("rascunho").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const inventoryItems = pgTable("inventoryItems", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  item: varchar("item", { length: 200 }).notNull(),
  quantityAvailable: integer("quantityAvailable").notNull(),
  reorderPoint: integer("reorderPoint").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const stockMovements = pgTable("stockMovements", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  inventoryItemId: integer("inventoryItemId").notNull().references(() => inventoryItems.id),
  type: stockMovementTypeEnum("type").notNull(),
  quantity: integer("quantity").notNull(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
});

export const deliveries = pgTable("deliveries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  purchaseOrderId: integer("purchaseOrderId").notNull().references(() => purchaseOrders.id),
  expectedAt: timestamp("expectedAt").notNull(),
  actualAt: timestamp("actualAt"),
  status: deliveryStatusEnum("status").default("pendente").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const protheusImports = pgTable("protheusImports", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  versionName: varchar("versionName", { length: 32 }).notNull().default("Compras - legado"),
  status: protheusImportStatusEnum("status").default("pending").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  rowCount: integer("rowCount").notNull(),
  importedAt: timestamp("importedAt").defaultNow().notNull(),
});

export const inventoryAnalytics = pgTable(
  "inventoryAnalytics",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    importId: integer("importId").notNull().references(() => protheusImports.id),
    code: varchar("code", { length: 120 }).notNull(),
    description: varchar("description", { length: 1000 }).notNull(),
    branch: varchar("branch", { length: 24 }).notNull(),
    productType: productTypeEnum("productType").default("ME").notNull(),
    mrp: mrpEnum("mrp").default("Não").notNull(),
    family: varchar("family", { length: 255 }).notNull().default(""),
    subfamily: varchar("subfamily", { length: 255 }).notNull().default(""),
    curve: curveEnum("curve").notNull(),
    sales13M: decimal("sales13M", { precision: 20, scale: 3 }).notNull(),
    salesValue13M: decimal("salesValue13M", { precision: 20, scale: 2 }).notNull().default("0"),
    stock: decimal("stock", { precision: 20, scale: 3 }).notNull(),
    stockValue: decimal("stockValue", { precision: 20, scale: 2 }).notNull().default("0"),
    coverageDays: decimal("coverageDays", { precision: 20, scale: 3 }).notNull(),
    excessValue: decimal("excessValue", { precision: 20, scale: 2 }).notNull(),
    capitalTurnover: decimal("capitalTurnover", { precision: 20, scale: 3 }).notNull().default("0"),
  },
  (table) => [uniqueIndex("inventoryAnalytics_import_code_branch_unique").on(table.importId, table.code, table.branch)],
);

export const costEvolutionImports = pgTable("costEvolutionImports", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  segment: costEvolutionSegmentEnum("segment").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  status: costEvolutionStatusEnum("status").default("pending").notNull(),
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
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    importId: integer("importId").notNull().references(() => costEvolutionImports.id),
    branch: varchar("branch", { length: 24 }).notNull(),
    aggregateCode: varchar("aggregateCode", { length: 120 }).notNull(),
    code: varchar("code", { length: 120 }).notNull(),
    mrp: mrpEnum("mrp").default("Não").notNull(),
    description: varchar("description", { length: 1000 }).notNull(),
    buyer: varchar("buyer", { length: 320 }).notNull().default(""),
    lastPurchaseDate: date("lastPurchaseDate"),
    lastPurchasePrice: decimal("lastPurchasePrice", { precision: 20, scale: 6 }),
  },
);