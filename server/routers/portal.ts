import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  assertPortalAdministrator,
  createAccessRequest,
  createPortalUser,
  getPortalIdentity,
  listAccessProfiles,
  listAccessRequests,
  listApplicationTreeForUser,
  listPortalUsers,
  resendActivationInvite,
  resendInvite,
  reviewAccessRequest,
  updatePortalUser,
} from "../supabasePortal";

function authorizationHeader(headers: Record<string, string | string[] | undefined>) {
  const value = headers.authorization;
  return Array.isArray(value) ? value[0] : value;
}

const profileKey = z.enum(["development-admin", "operations-admin", "manager", "operator", "viewer"]);

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
  profiles: publicProcedure.query(async ({ ctx }) => {
    await administrator(ctx);
    return listAccessProfiles();
  }),
  users: publicProcedure.query(async ({ ctx }) => {
    await administrator(ctx);
    return listPortalUsers();
  }),
  createUser: publicProcedure.input(z.object({ email: z.string().email(), displayName: z.string().trim().min(3).max(160), profileKey })).mutation(async ({ ctx, input }) => {
    const identity = await administrator(ctx);
    return createPortalUser(input, identity);
  }),
  updateUser: publicProcedure.input(z.object({ userId: z.string().uuid(), status: z.enum(["active", "inactive"]), profileKey })).mutation(async ({ ctx, input }) => {
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
    return reviewAccessRequest(input, identity);
  }),
});
