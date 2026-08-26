import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const caller = appRouter.createCaller({} as never);

describe("proteção de solicitações de acesso", () => {
  it("exige e-mail válido antes de consultar ou registrar uma solicitação", async () => {
    await expect(caller.portal.createAccessRequest({ email: "email-invalido", displayName: "Usuário de Teste" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("não aceita aprovação sem identificador válido de solicitação", async () => {
    await expect(caller.portal.reviewAccessRequest({ requestId: "invalido", decision: "approved", displayName: "Usuário de Teste", profileKey: "operator" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
