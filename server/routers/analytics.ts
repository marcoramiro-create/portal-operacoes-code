import { z } from "zod";
import { getAnalyticsDashboard, getAnalyticsFilterOptions, importProtheusWorkbook, listProtheusImports } from "../db";
import { publicProcedure, router } from "../_core/trpc";

const curveSchema = z.enum(["A", "B", "C", "D", "E"]);

export const analyticsRouter = router({
  dashboard: publicProcedure.input(z.object({ branch: z.string().min(1).optional(), curve: curveSchema.optional(), productType: z.enum(["ME", "PE"]).optional(), family: z.string().min(1).optional(), subfamily: z.string().min(1).optional() })).query(({ input }) => getAnalyticsDashboard(input)),
  filterOptions: publicProcedure.query(() => getAnalyticsFilterOptions()),
  imports: publicProcedure.query(() => listProtheusImports()),
  importWorkbook: publicProcedure.input(z.object({ fileName: z.string().trim().min(1).max(255), contentBase64: z.string().min(1).max(26_000_000) })).mutation(async ({ input }) => {
    const fileBuffer = Buffer.from(input.contentBase64, "base64");
    if (fileBuffer.byteLength > 18 * 1024 * 1024) throw new Error("A planilha excede o limite de 18 MB.");
    return importProtheusWorkbook(input.fileName, fileBuffer);
  }),
});
