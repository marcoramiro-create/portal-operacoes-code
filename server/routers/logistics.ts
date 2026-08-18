import { z } from "zod";
import {
  createDelivery,
  createInventoryItem,
  createPurchaseOrder,
  createSupplier,
  getDashboardMetrics,
  listDeliveries,
  listInventoryItems,
  listPurchaseOrders,
  listReportEntries,
  listStockMovements,
  listSuppliers,
  recordStockMovement,
  updateDelivery,
  updatePurchaseOrderStatus,
} from "../db";
import { publicProcedure, router } from "../_core/trpc";

const purchaseOrderStatus = z.enum(["rascunho", "aprovado", "enviado", "recebido", "cancelado"]);
const deliveryStatus = z.enum(["pendente", "recebido"]);

export const logisticsRouter = router({
  dashboard: publicProcedure.query(() => getDashboardMetrics()),
  suppliers: router({
    list: publicProcedure.query(() => listSuppliers()),
    create: publicProcedure.input(z.object({
      name: z.string().trim().min(1),
      contact: z.string().trim().min(1),
      category: z.string().trim().min(1),
      deliveryLeadTime: z.number().int().nonnegative(),
      evaluation: z.number().nonnegative(),
    })).mutation(({ input }) => createSupplier(input)),
  }),
  purchaseOrders: router({
    list: publicProcedure.query(() => listPurchaseOrders()),
    create: publicProcedure.input(z.object({
      supplierId: z.number().int().positive(),
      status: purchaseOrderStatus,
    })).mutation(({ input }) => createPurchaseOrder(input)),
    updateStatus: publicProcedure.input(z.object({
      id: z.number().int().positive(),
      status: purchaseOrderStatus,
    })).mutation(({ input }) => updatePurchaseOrderStatus(input.id, input.status)),
  }),
  inventory: router({
    list: publicProcedure.query(() => listInventoryItems()),
    create: publicProcedure.input(z.object({
      item: z.string().trim().min(1),
      quantityAvailable: z.number().int().nonnegative(),
      reorderPoint: z.number().int().nonnegative(),
    })).mutation(({ input }) => createInventoryItem(input)),
    movements: publicProcedure.query(() => listStockMovements()),
    registerMovement: publicProcedure.input(z.object({
      inventoryItemId: z.number().int().positive(),
      type: z.enum(["entrada", "saida"]),
      quantity: z.number().int().positive(),
    })).mutation(({ input }) => recordStockMovement(input)),
  }),
  deliveries: router({
    list: publicProcedure.query(() => listDeliveries()),
    create: publicProcedure.input(z.object({
      purchaseOrderId: z.number().int().positive(),
      expectedAt: z.date(),
      actualAt: z.date().optional(),
      status: deliveryStatus,
    })).mutation(({ input }) => createDelivery(input)),
    update: publicProcedure.input(z.object({
      id: z.number().int().positive(),
      status: deliveryStatus,
      actualAt: z.date().optional(),
    })).mutation(({ input }) => updateDelivery(input)),
  }),
  reports: router({
    list: publicProcedure.query(() => listReportEntries()),
  }),
});
