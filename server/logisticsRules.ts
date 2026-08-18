import type { DeliveryStatus, MovementType } from "./db";

export function calculateStockQuantity(currentQuantity: number, type: MovementType, quantity: number) {
  const nextQuantity = type === "entrada" ? currentQuantity + quantity : currentQuantity - quantity;
  if (nextQuantity < 0) {
    throw new Error("A saída não pode superar a quantidade disponível.");
  }
  return nextQuantity;
}

export function validateDeliveryReceipt(status: DeliveryStatus, actualAt?: Date) {
  if (status === "recebido" && !actualAt) {
    throw new Error("Informe a data realizada para um recebimento concluído.");
  }
}
