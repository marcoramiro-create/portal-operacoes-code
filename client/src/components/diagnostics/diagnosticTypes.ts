// ============================================================
// diagnosticTypes.ts — tipos compartilhados do Painel de Diagnóstico
// ============================================================
// Padrão definido no guia "Painel de Diagnóstico do Portal de
// Operações" (Claude, 08/11/2026). Componente agnóstico de domínio:
// recebe os itens já classificados, não conhece regra de negócio.
//
// Três estados canônicos — nunca inventar um quarto sem justificativa:
//   ok      — verificação executada e aprovada, COM evidência
//   pending — identificada mas não executada (ou falhou por falta de
//             configuração); SEMPRE implica ação concreta
//   review  — executada com resultado inconclusivo; exige análise humana
//
// Regra de honestidade: nunca OK sem evidência; nunca "review" para
// item simplesmente não verificado — isso é "pending".
// ============================================================

export type DiagnosticStatus = "ok" | "pending" | "review";

export type DiagnosticItem = {
  id: string;
  label: string;
  status: DiagnosticStatus;
  /** Comando, log, caminho ou consulta que comprova o resultado. */
  evidence?: string;
  /** Ação recomendada quando pending/review. Sem ação, o item não deveria estar no painel. */
  action?: string;
  /** Explicação curta. */
  detail?: string;
};

export type DiagnosticPanelProps = {
  title: string;
  subtitle?: string;
  environment?: string;
  reportedBy?: string;
  reportedAt?: string;
  summary?: string;
  items: DiagnosticItem[];
  verdict?: string;
  lastUpdated?: string;
  reportHref?: string;
};
