import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./supabasePortal", () => ({
  getPortalIdentity: vi.fn().mockResolvedValue({ id: "operator-user", email: "operator@example.com", displayName: null, isDevelopmentAdmin: false, profiles: ["operator"] }),
  assertPortalAdministrator: vi.fn(),
  assertApplicationPermission: vi.fn().mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Sem administração do módulo." })),
}));

vi.mock("./registrationAccess", () => ({
  assertRegistrationOperation: vi.fn(async (_identity: unknown, _type: string, operation: string) => {
    if (operation === "manage") throw new TRPCError({ code: "FORBIDDEN", message: "Você não possui liberação para esta operação de cadastro." });
    return { view: true, create: false, import: false, manage: false };
  }),
  registrationOperationsFor: vi.fn(),
}));

vi.mock("./registrationImports", () => ({
  commitRegistrationImport: vi.fn(),
  listRegistrationRecords: vi.fn(),
  previewRegistrationImport: vi.fn(),
  setRegistrationRecordActive: vi.fn(),
}));

import { cadastrosRouter } from "./routers/cadastros";

describe("contratos administrativos de cadastros", () => {
  const caller = cadastrosRouter.createCaller({ req: { headers: { authorization: "Bearer token" } } } as never);

  it("bloqueia a ativação ou inativação sem a permissão Administrar", async () => {
    await expect(caller.setActive({ type: "products", code: "PROD-1", active: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("bloqueia a edição explícita sem a permissão Administrar", async () => {
    await expect(caller.saveManaged({ type: "products", row: { codigo_produto: "PROD-1", nome_produto: "Produto", tipo_produto: "peça", ativo: "SIM" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
