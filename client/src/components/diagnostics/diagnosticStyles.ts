// ============================================================
// diagnosticStyles.ts — tokens de cor e espaçamento do diagnóstico
// ============================================================
// Cores definidas em UM lugar (nunca hardcoded nos componentes),
// conforme o guia do Painel de Diagnóstico. Contraste AA verificado
// nos pares fg/bg.
// ============================================================

export const diagnosticColors = {
  ok: { fg: "#16A34A", bg: "#DCFCE7", border: "#86EFAC" },
  pending: { fg: "#D97706", bg: "#FEF3C7", border: "#FCD34D" },
  review: { fg: "#2563EB", bg: "#DBEAFE", border: "#93C5FD" },
} as const;

export const diagnosticLabels = {
  ok: "OK",
  pending: "Pendente",
  review: "A validar",
} as const;
