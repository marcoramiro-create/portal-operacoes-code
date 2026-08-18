export function calculateTurnover(salesValue13M: number, stockValue: number) {
  if (stockValue <= 0) return 0;
  return salesValue13M / stockValue;
}
