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

  it("rejeita unidade e centro de custo sem código", async () => {
    await expect(caller.inventoryCatalog.createOrgUnit({ code: "", name: "Unidade teste" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.inventoryCatalog.createCostCenter({ code: "", name: "Centro teste" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejeita configuração de produto sem referências UUID válidas", async () => {
    await expect(caller.inventoryCatalog.configureProduct({ productId: "invalido", productTypeId: "invalido", unitOfMeasure: "UN", requiresSize: false, requiresLot: false, requiresExpiration: false, requiresCa: false })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejeita manutenção estrutural sem identificador UUID válido", async () => {
    await expect(caller.inventoryCatalog.updateEntry({ entity: "company", id: "invalido", code: "001", legalName: "Empresa" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.inventoryCatalog.setEntryActive({ entity: "warehouse", id: "invalido", active: false })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejeita uma importação estrutural sem linhas", async () => {
    await expect(caller.inventoryCatalog.importEntries({ entity: "company", rows: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
