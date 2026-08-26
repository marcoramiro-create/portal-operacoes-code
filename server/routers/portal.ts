import { publicProcedure, router } from "../_core/trpc";
import { listApplicationTree } from "../supabasePortal";

export const portalRouter = router({
  applicationTree: publicProcedure.query(() => listApplicationTree()),
});
