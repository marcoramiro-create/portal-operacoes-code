// ============================================================
// PipelineHealthPanel.tsx — 1ª instância do Painel de Diagnóstico
// ============================================================
// Saúde do pipeline de redução Protheus: infraestrutura (timer,
// worker, token, migration) + os 15 produtos. Usa o padrão do guia
// (OK/Pendente/A validar, contadores derivados, evidência por item).
// ============================================================
import { DiagnosticPanel, type DiagnosticItem } from "@/components/diagnostics/DiagnosticPanel";
import { trpc } from "@/lib/trpc";
import { LoaderCircle } from "lucide-react";

type PipelineHealth = {
  items: DiagnosticItem[];
  counts: { ok: number; pending: number; review: number };
  verdict: string;
  lastRunAt: string | null;
  generatedAt: string;
};

export default function PipelineHealthPanel() {
  const health = trpc.diagnostics.pipelineHealth.useQuery(undefined, { retry: false, refetchInterval: query => (query.state.data ? false : 10_000) });
  if (health.isLoading) {
    return <section className="sc-surface mb-5 flex items-center gap-3 p-5 text-sm font-semibold text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" />Consultando a saúde do pipeline…</section>;
  }
  if (health.error) {
    return null; // Sem permissão ou indisponível: o painel simplesmente não aparece.
  }
  const data = health.data as PipelineHealth;
  return (
    <div className="mb-5">
      <DiagnosticPanel
        title="Saúde do pipeline de redução Protheus"
        subtitle="Verifica a infraestrutura (timer, worker, token, migration) e o estado das 15 tabelas configuradas."
        environment="Homologação"
        summary="Cada item mostra a evidência que fundamenta o estado. Pendências sempre trazem a ação recomendada."
        items={data.items}
        verdict={data.verdict}
        lastUpdated={new Date(data.generatedAt).toLocaleString("pt-BR")}
      />
    </div>
  );
}
