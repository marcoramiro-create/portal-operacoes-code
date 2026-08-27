import { z } from "zod";
import { registrationTypes } from "../../shared/registrationLayouts";
import { assertApplicationPermission, assertPortalAdministrator, getPortalIdentity } from "../supabasePortal";
import { assertRegistrationOperation, registrationOperationsFor } from "../registrationAccess";
import { commitRegistrationImport, listRegistrationRecords, previewRegistrationImport, setRegistrationRecordActive } from "../registrationImports";
import { publicProcedure, router } from "../_core/trpc";

const typeSchema = z.enum(registrationTypes);
const rowsSchema = z.array(z.record(z.string(), z.string())).min(1).max(500);
const nodeForRegistration = { users: "usuarios-solicitacoes", employees: "funcionarios", suppliers: "fornecedores", products: "produtos" } as const;

function authorizationHeader(headers: Record<string, string | string[] | undefined>) { const value = headers.authorization; return Array.isArray(value) ? value[0] : value; }
async function administrator(ctx: { req: { headers: Record<string, string | string[] | undefined> } }) { const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers)); assertPortalAdministrator(identity); return identity; }

export const cadastrosRouter = router({
  capabilities: publicProcedure.input(z.object({ type: typeSchema })).query(async ({ ctx, input }) => { const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers)); await assertApplicationPermission(identity, nodeForRegistration[input.type], "view"); return registrationOperationsFor(identity, input.type); }),
  records: publicProcedure.input(z.object({ type: typeSchema })).query(async ({ ctx, input }) => { const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers)); await assertApplicationPermission(identity, nodeForRegistration[input.type], "view"); await assertRegistrationOperation(identity, input.type, "view"); return listRegistrationRecords(input.type); }),
  previewImport: publicProcedure.input(z.object({ type: typeSchema, rows: rowsSchema })).mutation(async ({ ctx, input }) => { const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers)); await assertApplicationPermission(identity, nodeForRegistration[input.type], "manage"); await assertRegistrationOperation(identity, input.type, "import"); return previewRegistrationImport(input.type, input.rows); }),
  commitImport: publicProcedure.input(z.object({ type: typeSchema, rows: rowsSchema })).mutation(async ({ ctx, input }) => { const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers)); await assertApplicationPermission(identity, nodeForRegistration[input.type], "manage"); await assertRegistrationOperation(identity, input.type, "import"); return commitRegistrationImport(input.type, input.rows, identity); }),
  saveDirect: publicProcedure.input(z.object({ type: typeSchema, row: z.record(z.string(), z.string()) })).mutation(async ({ ctx, input }) => { const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers)); await assertApplicationPermission(identity, nodeForRegistration[input.type], "manage"); await assertRegistrationOperation(identity, input.type, "create"); return commitRegistrationImport(input.type, [input.row], identity, "direct"); }),
  saveManaged: publicProcedure.input(z.object({ type: typeSchema, row: z.record(z.string(), z.string()) })).mutation(async ({ ctx, input }) => { const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers)); await assertApplicationPermission(identity, nodeForRegistration[input.type], "manage"); await assertRegistrationOperation(identity, input.type, "manage"); return commitRegistrationImport(input.type, [input.row], identity, "direct"); }),
  setActive: publicProcedure.input(z.object({ type: typeSchema, code: z.string().trim().min(1).max(320), storeCode: z.string().trim().min(1).max(80).optional(), active: z.boolean() })).mutation(async ({ ctx, input }) => { const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers)); await assertApplicationPermission(identity, nodeForRegistration[input.type], "manage"); await assertRegistrationOperation(identity, input.type, "manage"); return setRegistrationRecordActive(input.type, input.code, input.active, identity, input.storeCode); }),
});
