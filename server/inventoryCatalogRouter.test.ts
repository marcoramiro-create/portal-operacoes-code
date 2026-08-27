import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const caller = appRouter.createCaller({} as never);

describe("contratos do catálogo de almoxarifado", () => {
  it("rejeita empresa sem código antes de consultar a homologação", async () => {
    await expect(caller.inventoryCatalog.createCompany({ code: "", legalName: "Empresa de teste" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejeita filial sem referência válida de empresa", async () => {
    await expect(caller.inventoryCatalog.createBranch({ companyId: "invalido", code: "0101", name: "Filial teste" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejeita configuração de produto sem referências UUID válidas", async () => {
    await expect(caller.inventoryCatalog.configureProduct({ productId: "invalido", productTypeId: "invalido", unitOfMeasure: "UN", requiresSize: false, requiresLot: false, requiresExpiration: false, requiresCa: false })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
