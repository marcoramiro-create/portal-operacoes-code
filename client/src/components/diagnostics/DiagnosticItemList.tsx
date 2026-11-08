// ============================================================
// DiagnosticItemList.tsx — lista expansível por estado
// ============================================================
// Cada item traz: identificador curto, descrição, evidência e ação
// recomendada (quando pending/review). Navegável por teclado; o
// estado é anunciado via aria-label (nunca só cor).
// ============================================================
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { diagnosticColors, diagnosticLabels } from "./diagnosticStyles";
import type { DiagnosticItem, DiagnosticStatus } from "./diagnosticTypes";

export function DiagnosticItemList({ status, items }: { status: DiagnosticStatus; items: DiagnosticItem[] }) {
  const [open, setOpen] = useState(false);
  const colors = diagnosticColors[status];
  if (!items.length) return null;
  return (
    <div className="rounded-xl border" style={{ borderColor: colors.border }}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        style={{ background: colors.bg, color: colors.fg }}
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-label={`${items.length} item(ns) com estado ${diagnosticLabels[status]}. ${open ? "Recolher" : "Expandir"} lista.`}
      >
        <span className="text-sm font-extrabold">{diagnosticLabels[status]} · {items.length}</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <ul className="divide-y divide-slate-100 bg-white">
          {items.map(item => (
            <li key={item.id} className="px-4 py-3">
              <p className="text-sm font-extrabold text-slate-950">
                <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{item.id}</span>
                {item.label}
              </p>
              {item.detail && <p className="mt-1 text-xs font-medium leading-5 text-slate-600">{item.detail}</p>}
              {item.evidence && <p className="mt-1 text-xs font-medium text-slate-500"><span className="font-extrabold text-slate-600">Evidência:</span> {item.evidence}</p>}
              {item.action && (item.status === "pending" || item.status === "review") && (
                <p className="mt-1 text-xs font-semibold" style={{ color: colors.fg }}><span className="font-extrabold">Ação:</span> {item.action}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
