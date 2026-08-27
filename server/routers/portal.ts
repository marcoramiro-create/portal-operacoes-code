import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  assertPortalAdministrator,
  assertApplicationPermission,
  applicationPermissionsForUser,
  createAccessRequest,
  createPortalUser,
  getPortalIdentity,
  listAccessProfiles,
  listAccessRequests,
  listActiveEmployees,
  listApplicationTreeForUser,
  listPortalUsers,
  listProfileNodePermissions,
  listUserNodePermissions,
  resendActivationInvite,
  resendInvite,
  reviewAccessRequest,
  updateProfileNodePermission,
  updateUserNodePermission,
  updatePortalUser,
} from "../supabasePortal";
import { registrationOperations, resolvedRegistrationPermissionsForUser, updateRegistrationPermission } from "../registrationAccess";
import { registrationTypes } from "../../shared/registrationLayouts";

function authorizationHeader(headers: Record<string, string | string[] | undefined>) {
  const value = headers.authorization;
  return Array.isArray(value) ? value[0] : value;
}

const profileKey = z.enum(["development-admin", "operations-admin", "manager", "operator", "viewer"]);
const nodePermission = z.enum(["view", "manage", "approve"]);

async function administrator(ctx: { req: { headers: Record<string, string | string[] | undefined> } }) {
  const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
  assertPortalAdministrator(identity);
  return identity;
}

export const portalRouter = router({
  me: publicProcedure.query(async ({ ctx }) => getPortalIdentity(authorizationHeader(ctx.req.headers))),
  applicationTree: publicProcedure.query(async ({ ctx }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    return listApplicationTreeForUser(identity);
  }),
  applicationPermissions: publicProcedure.input(z.object({ nodeKey: z.string().trim().min(1).max(80) })).query(async ({ ctx, input }) => {
    const identity = await getPortalIdentity(authorizationHeader(ctx.req.headers));
    return applicationPermissionsForUser(identity, input.nodeKey);
  }),
  profiles: publicProcedure.query(async ({ ctx }) => {
    await administrator(ctx);
    return listAccessProfiles();
  }),
  users: publicProcedure.query(async ({ ctx }) => {
    await administrator(ctx);
    return listPortalUsers();
  }),
  employeeOptions: publicProcedure.query(async ({ ctx }) => {
    await administrator(ctx);
    return listActiveEmployees();
  }),
  createUser: publicProcedure.input(z.object({ email: z.string().email(), displayName: z.string().trim().min(3).max(160), profileKey })).mutation(async ({ ctx, input }) => {
    const identity = await administrator(ctx);
    return createPortalUser(input, identity);
  }),
  updateUser: publicProcedure.input(z.object({ userId: z.string().uuid(), status: z.enum(["active", "inactive"]), profileKey, canFulfillInventoryRequests: z.boolean().optional(), employeeId: z.string().uuid().nullable().optional() })).mutation(async ({ ctx, input }) => {
    const identity = await administrator(ctx);
    return updatePortalUser(input.userId, input, identity);
  }),
  resendInvite: publicProcedure.input(z.object({ email: z.string().email() })).mutation(async ({ ctx, input }) => {
    await administrator(ctx);
    return resendInvite(input.email);
  }),
  resendActivationInvite: publicProcedure.input(z.object({ userId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await administrator(ctx);
    return resendActivationInvite(input.userId);
  }),
  createAccessRequest: publicProcedure.input(z.object({ email: z.string().email(), displayName: z.string().trim().min(3).max(160), reason: z.string().trim().max(500).optional() })).mutation(({ input }) => createAccessRequest(input)),
  accessRequests: publicProcedure.query(async ({ ctx }) => {
    await administrator(ctx);
    return listAccessRequests();
  }),
  reviewAccessRequest: publicProcedure.input(z.object({ requestId: z.string().uuid(), decision: z.enum(["approved", "rejected"]), profileKey: profileKey.optional(), displayName: z.string().trim().min(3).max(160).optional() })).mutation(async ({ ctx, input }) => {
    const identity = await administrator(ctx);
    await assertApplicationPermission(identity, "usuarios-solicitacoes", "approve");
    return reviewAccessRequest(input, identity);
  }),
  registrationPermissions: publicProcedure.input(z.object({ userId: z.string().uuid() })).query(async ({ ctx, input }) => {
    await administrator(ctx);
    return resolvedRegistrationPermissionsForUser(input.userId);
  }),
  updateRegistrationPermission: publicProcedure.input(z.object({ userId: z.string().uuid(), type: z.enum(registrationTypes), operation: z.enum(registrationOperations), allowed: z.boolean() })).mutation(async ({ ctx, input }) => {
    const identity = await administrator(ctx);
    return updateRegistrationPermission(input, identity);
  }),
  profileNodePermissions: publicProcedure.input(z.object({ profileKey })).query(async ({ ctx, input }) => {
    await administrator(ctx);
    return listProfileNodePermissions(input.profileKey);
  }),
  updateProfileNodePermission: publicProcedure.input(z.object({ profileKey, nodeId: z.string().uuid(), permission: nodePermission, allowed: z.boolean() })).mutation(async ({ ctx, input }) => {
    const identity = await administrator(ctx);
    return updateProfileNodePermission(input, identity);
  }),
  userNodePermissions: publicProcedure.input(z.object({ userId: z.string().uuid() })).query(async ({ ctx, input }) => {
    await administrator(ctx);
    return listUserNodePermissions(input.userId);
  }),
  updateUserNodePermission: publicProcedure.input(z.object({ userId: z.string().uuid(), nodeId: z.string().uuid(), permission: nodePermission, allowed: z.boolean() })).mutation(async ({ ctx, input }) => {
    const identity = await administrator(ctx);
    return updateUserNodePermission(input, identity);
  }),
});
