import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const caller = appRouter.createCaller({} as never);

describe("contrato de importação Protheus", () => {
  it("rejeita uma carga sem nome de arquivo", async () => {
    await expect(caller.analytics.importWorkbook({ fileName: "", contentBase64: "eA==" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejeita uma curva fora da classificação ABCDE", async () => {
    await expect(caller.analytics.dashboard({ curve: "F" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
