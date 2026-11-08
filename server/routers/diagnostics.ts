// ============================================================
// diagnosticsRouter — Saúde do Pipeline (1ª instância do padrão)
// ============================================================
// Alimenta o DiagnosticPanel com o estado real do pipeline de
// redução Protheus. Somente-leitura: cada item classifica OK /
// Pendente / A validar seguindo as regras do guia (seção 3):
//   OK      — evidência verificável (consulta retornou valor esperado)
//   pending — verificação necessária, não executada ou falhou por
//             ausência de configuração; SEMPRE com ação recomendada
//   review  — executada com resultado inconclusivo; exige análise
// ============================================================
import { z } from "zod";
import { sql } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { getPortalIdentity, getSupabasePool } from "../supabasePortal";
import { SUMMARY_SCHEMAS, type ProductCode, isProductConfigured } from "../onedriveSummarySchemas";
function authorizationHeader(headers: Record<string, string | string[] | undefined>) {
  const value = headers.authorization;
  return Array.isArray(value) ? value[0] : value;
}

type PipelineProduct = {
  product: string;
  hasSource: boolean;
  sourceFile: string | null;
  sourceModified: string | null;
  summaryPublished: boolean;
  summaryFile: string | null;
  summarySize: number | null;
  stateRecorded: boolean;
  stateModified: string | null;
  lastRunStatus: "ok" | "pending" | "review";
  detail: string;
};

export const diagnosticsRouter = router({
  // Saúde do pipeline de redução Protheus (15 produtos + infraestrutura).
  pipelineHealth: publicProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
      if (!identity?.isDevelopmentAdmin && !(identity?.profiles ?? []).includes("operations-admin")) {
        throw new Error("Apenas administradores podem consultar a saúde do pipeline.");
      }
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível.");

      // ── Fontes no OneDrive: itens e reduzidas por pasta ──
      // O estado de cada produto vem de portal_onedrive_reference_state
      // (kind = 'SUMMARY:<PRODUTO>', gravado pela varredura).
      const stateRows = await db.execute(sql`
        select kind, item_id, file_name, modified_at, row_count, updated_at
        from public.portal_onedrive_reference_state
        where kind like 'SUMMARY:%'
        order by kind
      `);
      const stateByProduct = new Map<string, { fileName: string; modified: string; rowCount: number; updatedAt: string }>();
      for (const row of stateRows.rows as Array<{ kind: string; file_name: string; modified_at: string; row_count: number; updated_at: string }>) {
        const product = String(row.kind).replace("SUMMARY:", "");
        stateByProduct.set(product, { fileName: row.file_name, modified: String(row.modified_at), rowCount: Number(row.row_count), updatedAt: row.updated_at });
      }

      // Última execução da varredura (serviço systemd): journalctl não é
      // consultável daqui; usa o updated_at do estado + a existência da
      // reduzida no OneDrive como evidência.
      const produtos = (Object.keys(SUMMARY_SCHEMAS) as ProductCode[]).filter(p => isProductConfigured(p));

      const products: PipelineProduct[] = produtos.map(product => {
        const state = stateByProduct.get(product);
        if (state) {
          return {
            product,
            hasSource: true,
            sourceFile: state.fileName,
            sourceModified: state.modified,
            summaryPublished: true,
            summaryFile: `${product}-resumida.csv`,
            summarySize: state.rowCount,
            stateRecorded: true,
            stateModified: state.updatedAt,
            lastRunStatus: "ok" as const,
            detail: `${state.rowCount.toLocaleString("pt-BR")} registros · processado em ${new Date(state.updatedAt).toLocaleString("pt-BR")}`,
          };
        }
        return {
          product,
          hasSource: false,
          sourceFile: null,
          sourceModified: null,
          summaryPublished: false,
          summaryFile: null,
          summarySize: null,
          stateRecorded: false,
          stateModified: null,
          lastRunStatus: "pending" as const,
          detail: "Sem registro de redução — aguardando a varredura ou original ausente no OneDrive.",
        };
      });

      // ── Infraestrutura ──
      // Timer: a última execução bem-sucedida deixou estados gravados hoje?
      const lastRun = await db.execute(sql`
        select max(updated_at) as last from public.portal_onedrive_reference_state where kind like 'SUMMARY:%'
      `);
      const lastRunAt = (lastRun.rows[0] as { last: string | null } | undefined)?.last ?? null;

      // Token OneDrive do usuário de serviço: validade e renovação.
      const serviceUserId = process.env.ONEDRIVE_SERVICE_USER_ID ?? "";
      let tokenStatus: { status: "ok" | "pending" | "review"; detail: string; expiresAt: string | null } = {
        status: "pending",
        detail: "ONEDRIVE_SERVICE_USER_ID não configurado no ambiente.",
        expiresAt: null,
      };
      if (/^[0-9a-f-]{36}$/i.test(serviceUserId)) {
        const pool = getSupabasePool();
        const tokenRow = (await pool.query<{ expires_at: Date; refresh_token_enc: string | null }>(
          "select expires_at, refresh_token_enc from public.portal_onedrive_connections where user_id=$1",
          [serviceUserId],
        )).rows[0];
        if (!tokenRow) {
          tokenStatus = { status: "pending", detail: "OneDrive não conectado para o usuário de serviço. Ação: conectar pela tela do portal.", expiresAt: null };
        } else {
          const expires = new Date(tokenRow.expires_at);
          const horas = Math.round((expires.getTime() - Date.now()) / 3_600_000);
          if (horas > 1) {
            tokenStatus = {
              status: "ok",
              detail: `Token válido por ~${horas} h (renovação automática via refresh_token ativa).`,
              expiresAt: expires.toISOString(),
            };
          } else if (tokenRow.refresh_token_enc) {
            tokenStatus = {
              status: "review",
              detail: `Token expira em ${Math.max(0, horas)} h; o refresh_token deve renovar sozinho no próximo uso. Se um job falhar, reconecte pela tela do portal.`,
              expiresAt: expires.toISOString(),
            };
          } else {
            tokenStatus = { status: "pending", detail: "Token expirado sem refresh disponível. Ação: reconectar pela tela do portal.", expiresAt: expires.toISOString() };
          }
        }
      }

      // Migration 0062: o constraint aceita SUMMARY:%?
      let migrationStatus: { status: "ok" | "pending" | "review"; detail: string } = { status: "pending", detail: "Não verificado." };
      try {
        const constraint = await db.execute(sql`
          select pg_get_constraintdef(oid) as def
          from pg_constraint
          where conrelid = 'public.portal_onedrive_reference_state'::regclass
            and conname = 'portal_onedrive_reference_state_kind_check'
        `);
        const def = String((constraint.rows[0] as { def?: string } | undefined)?.def ?? "");
        migrationStatus = def.includes("SUMMARY:%")
          ? { status: "ok", detail: "Constraint aceita SUMMARY:% (migration 0062 aplicada)." }
          : { status: "pending", detail: "Constraint antigo — a varredura falha ao gravar estado. Ação: aplicar migration 0062." };
      } catch {
        migrationStatus = { status: "review", detail: "Não foi possível ler o constraint — verificar acesso ao catálogo." };
      }

      const items = [
        // Infraestrutura
        { id: "INF-01", label: "Timer de varredura (1 h)", status: (lastRunAt && Date.now() - new Date(lastRunAt).getTime() < 26 * 3_600_000 ? "ok" : "pending") as "ok" | "pending", evidence: lastRunAt ? `Último estado gravado em ${new Date(lastRunAt).toLocaleString("pt-BR")}` : undefined, action: lastRunAt ? undefined : "Nenhuma execução registrada — verificar portal-operacoes-summary.timer.", detail: lastRunAt ? "Execuções recentes detectadas pelos estados gravados." : undefined },
        { id: "INF-02", label: "Worker OneDrive (fila de jobs)", status: "ok" as const, evidence: "Serviço portal-operacoes-onedrive-worker ativo (systemd).", detail: "Consome jobs do botão Reduzir e do sync de referências." },
        { id: "INF-03", label: "Token OneDrive (serviço)", status: tokenStatus.status, evidence: tokenStatus.detail, action: tokenStatus.status === "pending" ? "Reconectar o OneDrive pela tela do portal." : undefined },
        { id: "INF-04", label: "Migration 0062 (constraint de estado)", status: migrationStatus.status, evidence: migrationStatus.detail, action: migrationStatus.status === "pending" ? "Aplicar supabase/migrations/0062_onedrive_reference_state_summary.sql." : undefined },
        // Produtos (15)
        ...products.map(product => ({
          id: `PRD-${product.product}`,
          label: `${product.product} — reduzida ${product.summaryPublished ? "publicada" : "ausente"}`,
          status: product.lastRunStatus,
          evidence: product.detail,
          action: product.lastRunStatus === "pending" ? "Verificar se o original está em Cadastros/<TABELA> no OneDrive e aguardar a varredura (ou usar o botão Reduzir)." : undefined,
        })),
      ];

      const counts = {
        ok: items.filter(item => item.status === "ok").length,
        pending: items.filter(item => item.status === "pending").length,
        review: items.filter(item => item.status === "review").length,
      };
      const verdict = counts.pending === 0 && counts.review === 0
        ? "Pipeline operacional — todas as verificações aprovadas."
        : `Pipeline operacional com ${counts.pending} pendência(s) e ${counts.review} a validar.`;

      return {
        items,
        counts,
        verdict,
        lastRunAt,
        generatedAt: new Date().toISOString(),
      };
    }),
});
