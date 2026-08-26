import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const caller = appRouter.createCaller({} as never);

describe("contratos administrativos do portal", () => {
  it("rejeita a criação de usuário com e-mail inválido antes de acessar a base externa", async () => {
    await expect(caller.portal.createUser({ email: "invalido", displayName: "Usuário de Teste", profileKey: "operator" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejeita uma solicitação de acesso sem nome suficiente", async () => {
    await expect(caller.portal.createAccessRequest({ email: "usuario@empresa.com", displayName: "A" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejeita o reenvio de ativação sem um identificador de usuário válido", async () => {
    await expect(caller.portal.resendActivationInvite({ userId: "invalido" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
