import { desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  deliveries,
  inventoryItems,
  purchaseOrders,
  stockMovements,
  suppliers,
  type InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { calculateStockQuantity, validateDeliveryReceipt } from "./logisticsRules";

export type PurchaseOrderStatus = "rascunho" | "aprovado" | "enviado" | "recebido" | "cancelado";
export type DeliveryStatus = "pendente" | "recebido";
export type MovementType = "entrada" | "saida";

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

export async function listSuppliers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(suppliers).orderBy(desc(suppliers.createdAt));
}

export async function createSupplier(input: {
  name: string;
  contact: string;
  category: string;
  deliveryLeadTime: number;
  evaluation: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.insert(suppliers).values({
    ...input,
    evaluation: input.evaluation.toFixed(1),
  });
  return { success: true } as const;
}

export async function listPurchaseOrders() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: purchaseOrders.id,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
      supplierCategory: suppliers.category,
      status: purchaseOrders.status,
      createdAt: purchaseOrders.createdAt,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .orderBy(desc(purchaseOrders.createdAt));
}

export async function createPurchaseOrder(input: { supplierId: number; status: PurchaseOrderStatus }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.insert(purchaseOrders).values(input);
  return { success: true } as const;
}

export async function updatePurchaseOrderStatus(id: number, status: PurchaseOrderStatus) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.update(purchaseOrders).set({ status }).where(eq(purchaseOrders.id, id));
  return { success: true } as const;
}

export async function listInventoryItems() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inventoryItems).orderBy(desc(inventoryItems.createdAt));
}

export async function createInventoryItem(input: {
  item: string;
  quantityAvailable: number;
  reorderPoint: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.insert(inventoryItems).values(input);
  return { success: true } as const;
}

export async function listStockMovements() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: stockMovements.id,
      inventoryItemId: stockMovements.inventoryItemId,
      item: inventoryItems.item,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      occurredAt: stockMovements.occurredAt,
    })
    .from(stockMovements)
    .innerJoin(inventoryItems, eq(stockMovements.inventoryItemId, inventoryItems.id))
    .orderBy(desc(stockMovements.occurredAt));
}

export async function recordStockMovement(input: {
  inventoryItemId: number;
  type: MovementType;
  quantity: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  await db.transaction(async tx => {
    const item = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, input.inventoryItemId)).limit(1);
    const currentItem = item[0];
    if (!currentItem) throw new Error("Item de estoque não encontrado.");

    const nextQuantity = calculateStockQuantity(currentItem.quantityAvailable, input.type, input.quantity);

    await tx.update(inventoryItems).set({ quantityAvailable: nextQuantity }).where(eq(inventoryItems.id, input.inventoryItemId));
    await tx.insert(stockMovements).values(input);
  });

  return { success: true } as const;
}

export async function listDeliveries() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: deliveries.id,
      purchaseOrderId: deliveries.purchaseOrderId,
      expectedAt: deliveries.expectedAt,
      actualAt: deliveries.actualAt,
      status: deliveries.status,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      supplierCategory: suppliers.category,
    })
    .from(deliveries)
    .innerJoin(purchaseOrders, eq(deliveries.purchaseOrderId, purchaseOrders.id))
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .orderBy(desc(deliveries.expectedAt));
}

export async function createDelivery(input: {
  purchaseOrderId: number;
  expectedAt: Date;
  actualAt?: Date;
  status: DeliveryStatus;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  validateDeliveryReceipt(input.status, input.actualAt);
  await db.insert(deliveries).values(input);
  return { success: true } as const;
}

export async function updateDelivery(input: { id: number; status: DeliveryStatus; actualAt?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  validateDeliveryReceipt(input.status, input.actualAt);
  await db.update(deliveries).set({ status: input.status, actualAt: input.actualAt ?? null }).where(eq(deliveries.id, input.id));
  return { success: true } as const;
}

export async function getDashboardMetrics() {
  const db = await getDb();
  if (!db) return { openOrders: 0, stockLevel: 0, pendingDeliveries: 0, averageLeadTime: 0 };

  const [openOrders, stockLevel, pendingDeliveries, averageLeadTime] = await Promise.all([
    db.select({ value: sql<number>`count(*)` }).from(purchaseOrders).where(inArray(purchaseOrders.status, ["rascunho", "aprovado", "enviado"])),
    db.select({ value: sql<number>`coalesce(sum(${inventoryItems.quantityAvailable}), 0)` }).from(inventoryItems),
    db.select({ value: sql<number>`count(*)` }).from(deliveries).where(eq(deliveries.status, "pendente")),
    db.select({ value: sql<number>`coalesce(avg(${suppliers.deliveryLeadTime}), 0)` }).from(suppliers),
  ]);

  return {
    openOrders: Number(openOrders[0]?.value ?? 0),
    stockLevel: Number(stockLevel[0]?.value ?? 0),
    pendingDeliveries: Number(pendingDeliveries[0]?.value ?? 0),
    averageLeadTime: Number(averageLeadTime[0]?.value ?? 0),
  };
}

export async function listReportEntries() {
  const db = await getDb();
  if (!db) return [];

  const [orders, movements, deliveryRows] = await Promise.all([
    listPurchaseOrders(),
    listStockMovements(),
    listDeliveries(),
  ]);

  return [
    ...orders.map(order => ({
      id: `pedido-${order.id}`,
      record: "Pedido de compra",
      detail: `Pedido #${order.id} — ${order.status}`,
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      category: order.supplierCategory,
      occurredAt: order.createdAt,
    })),
    ...movements.map(movement => ({
      id: `estoque-${movement.id}`,
      record: "Movimentação de estoque",
      detail: `${movement.type} — ${movement.item} (${movement.quantity})`,
      supplierId: null,
      supplierName: null,
      category: null,
      occurredAt: movement.occurredAt,
    })),
    ...deliveryRows.map(delivery => ({
      id: `entrega-${delivery.id}`,
      record: "Entrega",
      detail: `Pedido #${delivery.purchaseOrderId} — ${delivery.status}`,
      supplierId: delivery.supplierId,
      supplierName: delivery.supplierName,
      category: delivery.supplierCategory,
      occurredAt: delivery.actualAt ?? delivery.expectedAt,
    })),
  ].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
}
