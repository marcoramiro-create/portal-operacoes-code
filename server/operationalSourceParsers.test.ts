import { describe, expect, it } from "vitest";
import { parseNfLegal, parsePurchaseOrders, parseStockEvolution } from "./operationalSourceParsers";

describe("operationalSourceParsers", () => {
  it("valida Pedido com chave filial/pedido/item", () => {
    const result = parsePurchaseOrders("Filial;Numero PC;Item;Produto\n0101;045209;0001;000000136-MGT\n");
    expect(result.rows[0].key).toBe("0101|045209|0001");
    expect(result.rows[0].productCode).toBe("000000136-MGT");
  });
  it("valida NF Legal em CSV com chave fiscal", () => {
    const result = parseNfLegal("Filial;NF;SÉRIE;CNPJ;RAZÃO SOCIAL;DT. EMISSÃO;DT. PRÉ-NOTA;CHAVE\n0101;123;1;12.345.678/0001-90;Fornecedor;01/09/2026;02/09/2026;35260100000000000000550010000001231234567890\n", "NF_LEGAL");
    expect(result.rows[0].invoiceNumber).toBe("123");
    expect(result.rows[0].accessKey).toHaveLength(44);
  });
  it("valida estoque vertical em CSV", () => {
    const result = parseStockEvolution("Empresa;Codigo Item;Codigo Agregado;Desc.Item;Unid.Med.;Ano;Mês;Quantidade;Valor Total\n0105;000000136-MGT;000000136;Produto;UN;2026;9;2;10\n");
    expect(result.rows[0].productCode).toBe("000000136-MGT");
    expect(result.rows[0].month).toBe(9);
  });
});
