import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { assertPortalAdministrator, getPortalIdentity } from "./supabasePortal";
import { importCatalogRows } from "./operationalImportService";
import { parseSa2, parseSb1, parseSb5, parseSbz } from "./protheusCatalogParsers";

function auth(headers: Record<string,string|string[]|undefined>) { const value=headers.authorization; return Array.isArray(value) ? value[0] : value; }
const input = z.object({ fileName: z.string().trim().min(1).max(255), contentBase64: z.string().min(1) });
async function admin(ctx: { req: { headers: Record<string,string|string[]|undefined> } }) { const identity=await getPortalIdentity(auth(ctx.req.headers)); assertPortalAdministrator(identity); }

export const operationalImportRouter = router({
  importSb1: publicProcedure.input(input).mutation(async ({ctx,input}) => { await admin(ctx); const content=Buffer.from(input.contentBase64,"base64"); const parsed=parseSb1(content); return importCatalogRows({sourceKind:"SB1",fileName:input.fileName,content,rows:parsed.rows}); }),
  importSbz: publicProcedure.input(input).mutation(async ({ctx,input}) => { await admin(ctx); const content=Buffer.from(input.contentBase64,"base64"); const parsed=parseSbz(content); return importCatalogRows({sourceKind:"SBZ",fileName:input.fileName,content,rows:parsed.rows}); }),
  importSb5: publicProcedure.input(input).mutation(async ({ctx,input}) => { await admin(ctx); const content=Buffer.from(input.contentBase64,"base64"); const parsed=parseSb5(content); return importCatalogRows({sourceKind:"SB5",fileName:input.fileName,content,rows:parsed.rows}); }),
  importSa2: publicProcedure.input(input).mutation(async ({ctx,input}) => { await admin(ctx); const content=Buffer.from(input.contentBase64,"base64"); const parsed=parseSa2(content); return importCatalogRows({sourceKind:"SA2",fileName:input.fileName,content,rows:parsed.rows}); }),
});
