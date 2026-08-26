import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permissionGuard: vi.fn() }));

vi.mock("./supabasePortal", () => ({
  assertPortalAdministrator: vi.fn(),
  assertApplicationPermission: mocks.permissionGuard,
  createAccessRequest: vi.fn(),
  createPortalUser: vi.fn(),
  getPortalIdentity: vi.fn().mockResolvedValue({ id: "manager", email: "manager@example.com", displayName: null, isDevelopmentAdmin: false, profiles: ["manager"] }),
  listAccessProfiles: vi.fn(),
  listAccessRequests: vi.fn(),
  listApplicationTreeForUser: vi.fn(),
  listPortalUsers: vi.fn(),
  listProfileNodePermissions: vi.fn(),
  listUserNodePermissions: vi.fn(),
  resendActivationInvite: vi.fn(),
  resendInvite: vi.fn(),
  reviewAccessRequest: vi.fn().mockResolvedValue({ success: true }),
  updateProfileNodePermission: vi.fn(),
  updateUserNodePermission: vi.fn(),
  updatePortalUser: vi.fn(),
}));

vi.mock("./registrationAccess", () => ({ registrationOperations: ["view", "create", "import", "manage"], resolvedRegistrationPermissionsForUser: vi.fn(), updateRegistrationPermission: vi.fn() }));
vi.mock("../shared/registrationLayouts", () => ({ registrationTypes: ["users", "employees", "suppliers", "products"] }));

import { portalRouter } from "./routers/portal";

describe("contrato de aprovação de acessos", () => {
  const caller = portalRouter.createCaller({ req: { headers: { authorization: "Bearer token" } } } as never);

  it("bloqueia a revisão de acesso sem o nível Aprovar", async () => {
    mocks.permissionGuard.mockRejectedValueOnce(new TRPCError({ code: "FORBIDDEN", message: "Sem aprovação." }));
    await expect(caller.reviewAccessRequest({ requestId: "00000000-0000-4000-8000-000000000001", decision: "rejected" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("permite a revisão de acesso quando o nível Aprovar está liberado", async () => {
    mocks.permissionGuard.mockResolvedValueOnce(true);
    await expect(caller.reviewAccessRequest({ requestId: "00000000-0000-4000-8000-000000000002", decision: "rejected" })).resolves.toEqual({ success: true });
  });
});
