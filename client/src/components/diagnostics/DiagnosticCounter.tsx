// ============================================================
// DiagnosticCounter.tsx — bloco de contador individual
// ============================================================
// Número grande + rótulo + cor do token. O número é derivado dos
// itens (nunca passado manualmente). aria-live para atualização
// dinâmica; ícone + rótulo textual (acessibilidade: nunca só cor).
// ============================================================
import type { ReactNode } from "react";
import { diagnosticColors, diagnosticLabels } from "./diagnosticStyles";
import type { DiagnosticStatus } from "./diagnosticTypes";

export function DiagnosticCounter({ status, count, icon }: { status: DiagnosticStatus; count: number; icon: ReactNode }) {
  const colors = diagnosticColors[status];
  return (
    <div
      className="flex items-center gap-3 rounded-xl border p-4"
      style={{ background: colors.bg, borderColor: colors.border, color: colors.fg }}
      aria-label={`${diagnosticLabels[status]}: ${count} item(ns)`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/70">{icon}</span>
      <div>
        <p className="text-2xl font-extrabold leading-none tracking-tight" aria-live="polite">{count}</p>
        <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.12em]">{diagnosticLabels[status]}</p>
      </div>
    </div>
  );
}
