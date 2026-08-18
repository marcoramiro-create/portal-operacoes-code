import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const caller = appRouter.createCaller({} as never);

describe("contratos dos módulos logísticos", () => {
  it("rejeita fornecedor sem os campos obrigatórios", async () => {
    await expect(caller.logistics.suppliers.create({
      name: "",
      contact: "",
      category: "",
      deliveryLeadTime: -1,
      evaluation: -1,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejeita pedido de compra sem fornecedor válido", async () => {
    await expect(caller.logistics.purchaseOrders.create({
      supplierId: 0,
      status: "rascunho",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejeita item de estoque com quantidades negativas", async () => {
    await expect(caller.logistics.inventory.create({
      item: "Item",
      quantityAvailable: -1,
      reorderPoint: 0,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejeita movimentação sem quantidade positiva", async () => {
    await expect(caller.logistics.inventory.registerMovement({
      inventoryItemId: 1,
      type: "entrada",
      quantity: 0,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejeita entrega sem pedido de compra válido", async () => {
    await expect(caller.logistics.deliveries.create({
      purchaseOrderId: 0,
      expectedAt: new Date(),
      status: "pendente",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
