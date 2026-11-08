export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits, minimumFractionDigits: 0 }).format(value);
}

// REGRA (08/11/2026): dinheiro SEM o prefixo R$ em todo o portal —
// somente o montante com separador de milhar pt-BR (ex.: 17.423.544).
export function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}
