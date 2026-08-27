import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const caller = appRouter.createCaller({} as never);

describe("contratos de ferramentas do almoxarifado", () => {
  it("rejeita o cadastro com identificadores inválidos antes de consultar a homologação", async () => {
    await expect(caller.inventoryTools.create({ productId: "invalido", instanceCode: "FUR-0001", locationId: "invalido", conditionState: "good" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejeita condição de devolução fora do catálogo", async () => {
    await expect(caller.inventoryTools.return({ toolId: "invalido", locationId: "invalido", conditionState: "outro" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
