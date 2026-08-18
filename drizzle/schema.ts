import { decimal, int, mysqlEnum, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  status: mysqlEnum("status", ["rascunho", "aprovado", "enviado", "recebido", "cancelado"])
    .default("rascunho")
    .notNull(),
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

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Supplier = typeof suppliers.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
