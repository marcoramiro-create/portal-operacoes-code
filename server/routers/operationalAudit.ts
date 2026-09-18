import { publicProcedure, router } from "../_core/trpc";
import { getPortalIdentity, assertPortalAdministrator } from "../supabasePortal";
import { queryOperationalAudit } from "../operationalAuditQueryService";

function authorizationHeader(headers: Record<string, string | string[] | undefined>) {
  const value = headers.authorization;
  return Array.isArray(value) ? value[0] : value;
}

export const operationalAuditRouter = router({
  report: publicProcedure.query(async ({ ctx }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    assertPortalAdministrator(identity);
    const report = await queryOperationalAudit();
    return {
      generatedAt: report.generatedAt,
      readOnly: report.readOnly,
      metrics: report.metrics,
      exceptionCount: report.exceptions.length,
      duplicateCount: report.duplicates.length,
      exceptions: report.exceptions.slice(0, 500),
      duplicates: report.duplicates.slice(0, 500),
      truncated: report.exceptions.length > 500 || report.duplicates.length > 500,
    };
  }),
});
