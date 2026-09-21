import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  const authorization = opts.req.headers.authorization;
  const hasBearer = typeof authorization === "string" && /^Bearer\s+/i.test(authorization);
  const hasPortalSession = typeof authorization === "string" && /^PortalSession\s+/i.test(authorization);

  // Supabase Bearer tokens are resolved by the portal routers through
  // getPortalIdentity(). A PortalSession is resolved by the same layer using
  // portal_sessions; neither token must reach the legacy OAuth verifier.
  if (!hasBearer && !hasPortalSession) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
