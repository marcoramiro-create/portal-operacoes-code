// ============================================================
// DiagnosticPanel.tsx — componente principal do Painel de Diagnóstico
// ============================================================
// Padrão reutilizável do guia "Painel de Diagnóstico do Portal de
// Operações" (Claude, 08/11/2026). Quatro camadas, sempre nesta ordem:
//   1. Cabeçalho de contexto (título, metadados, resumo executivo)
//   2. Faixa de contadores (OK / Pendente / A validar — DERIVADOS dos itens)
//   3. Lista detalhada por estado (expansível)
//   4. Rodapé de conclusão (veredito, timestamp, relatório)
//
// Anti-padrões respeitados: contadores sempre derivados dos itens;
// três estados canônicos; cores só dos tokens; sem pendência sem ação.
// ============================================================
import { CheckCircle2, CircleAlert, HelpCircle, ExternalLink } from "lucide-react";
import { DiagnosticCounter } from "./DiagnosticCounter";
import { DiagnosticItemList } from "./DiagnosticItemList";
import type { DiagnosticItem, DiagnosticPanelProps, DiagnosticStatus } from "./diagnosticTypes";

function statusIcons(status: DiagnosticStatus, className = "h-5 w-5") {
  if (status === "ok") return <CheckCircle2 className={className} />;
  if (status === "pending") return <CircleAlert className={className} />;
  return <HelpCircle className={className} />;
}

export function DiagnosticPanel({ title, subtitle, environment, reportedBy, reportedAt, summary, items, verdict, lastUpdated, reportHref }: DiagnosticPanelProps) {
  // Contadores SEMPRE derivados dos itens — nunca passados manualmente
  // (evita divergência entre contador e lista).
  const byStatus = (status: DiagnosticStatus) => items.filter(item => item.status === status);
  const counts = { ok: byStatus("ok").length, pending: byStatus("pending").length, review: byStatus("review").length };
  const ordem: DiagnosticStatus[] = ["ok", "pending", "review"];
  return (
    <section className="sc-surface p-5 sm:p-7" aria-label={title}>
      {/* 1. Cabeçalho de contexto */}
      <header>
        <p className="eyebrow">Painel de diagnóstico</p>
        <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">{title}</h2>
        {(environment || reportedBy || reportedAt) && (
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {[environment, reportedBy && `Responsável: ${reportedBy}`, reportedAt && `Reportado em: ${reportedAt}`].filter(Boolean).join(" · ")}
          </p>
        )}
        {subtitle && <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>}
        {summary && <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-600">{summary}</p>}
      </header>
      {/* 2. Faixa de contadores */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {ordem.map(status => <DiagnosticCounter key={status} status={status} count={counts[status]} icon={statusIcons(status)} />)}
      </div>
      {/* 3. Listas detalhadas por estado (expansíveis) */}
      <div className="mt-4 grid gap-3">
        {ordem.map(status => <DiagnosticItemList key={status} status={status} items={byStatus(status)} />)}
      </div>
      {/* 4. Rodapé de conclusão */}
      {(verdict || lastUpdated || reportHref) && (
        <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div>
            {verdict && <p className="text-sm font-extrabold text-slate-950">{verdict}</p>}
            {lastUpdated && <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Última atualização: {lastUpdated}</p>}
          </div>
          {reportHref && (
            <a className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:text-sky-900" href={reportHref} target="_blank" rel="noreferrer">
              Relatório completo <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </footer>
      )}
    </section>
  );
}

export type { DiagnosticItem, DiagnosticPanelProps, DiagnosticStatus };
