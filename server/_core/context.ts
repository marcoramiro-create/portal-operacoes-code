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

  // Requests authenticated by Supabase are resolved by the portal routers
  // through getPortalIdentity(). Do not pass their JWT to the legacy OAuth
  // verifier, which expects the separate Manus HS256 session format.
  if (!hasBearer) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
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
