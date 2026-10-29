import { describe, expect, it } from "vitest";
import { buildClassificationMaterializationPlan } from "./catalogClassificationMaterialization";

describe("materialização unificada de ZFM e ZSF", () => {
  it("vincula produto por SB1 sem remover zeros dos códigos", () => {
    const plan = buildClassificationMaterializationPlan({
      families: [{ code: "0000002", description: "Família" }],
      subfamilies: [{ code: "0000046", description: "Subfamília" }],
      products: [{ productCode: "00000136-MGT", family: "0000002", subfamily: "0000046" }],
    });
    expect(plan.issues).toEqual([]);
    expect(plan.links).toEqual([
      { productCode: "00000136-MGT", kind: "FAMILIA", classificationCode: "0000002" },
      { productCode: "00000136-MGT", kind: "SUBFAMILIA", classificationCode: "0000046" },
    ]);
  });

  it("registra classificação da SB1 ausente sem descartar o produto", () => {
    const plan = buildClassificationMaterializationPlan({
      families: [],
      subfamilies: [{ code: "0000046", description: "Subfamília" }],
      products: [{ productCode: "03545", family: "0000002", subfamily: "0000046" }],
    });
    expect(plan.links).toEqual([{ productCode: "03545", kind: "SUBFAMILIA", classificationCode: "0000046" }]);
    expect(plan.issues).toEqual([{ productCode: "03545", kind: "FAMILIA", code: "0000002", message: "Código da SB1 não encontrado no catálogo OneDrive." }]);
  });

  it("registra produto sem família ou subfamília para auditoria", () => {
    const plan = buildClassificationMaterializationPlan({
      families: [{ code: "0000002", description: "Família" }],
      subfamilies: [],
      products: [{ productCode: "07387", family: "", subfamily: "" }],
    });
    expect(plan.links).toEqual([]);
    expect(plan.issues).toHaveLength(2);
  });
});
