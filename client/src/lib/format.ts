export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

export function formatDateInput(value: Date | string | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export function toDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}
