import { describe, expect, it } from "vitest";
import { parseSa2, parseSb1, parseSb5, parseSbz } from "./protheusCatalogParsers";

describe("protheusCatalogParsers", () => {
  it("preserva SB1 Codigo e Cod Agregado com zeros e relação 1:N", () => {
    const r = parseSb1("Tabela SB1\n\nCodigo;Cod Agregado;Descricao;Tipo;Familia;Sub-familia\n00000136-MGT;00000136;Produto A;ME;0000002;0000002\n00000137-MGT;00000136;Produto B;ME;0000002;0000002\n");
    expect(r.rows).toHaveLength(2); expect(r.rows[0].productCode).toBe("00000136-MGT"); expect(r.rows[0].aggregateProductCode).toBe("00000136"); expect(r.rows[1].normalizedAggregateProductCode).toBe("00000136");
  });
  it("normaliza SBZ com filial de quatro dígitos e preserva produto", () => {
    const r = parseSbz("SBZ\n\nFilial;Codigo;Grupo Trib.;Tipo;Estoq Minimo;Estoq Maximo;Origem;Entra MRP;Class.Fiscal\n101;00000136-MGT;;;0;0;0;Sim;\n");
    expect(r.rows[0].branchCode).toBe("0101"); expect(r.rows[0].productCode).toBe("00000136-MGT"); expect(r.rows[0].mrp).toBe(true);
  });
  it("preserva campos vazios da SB5", () => {
    const r = parseSb5("SB5\n\nProduto;Familia Tec.;Família Peça;Marca Peca;Linha Peça\n00000136-MGT;;;;\n");
    expect(r.rows[0].productCode).toBe("00000136-MGT"); expect(r.rows[0].technicalFamily).toBe("");
  });
  it("usa Codigo+Loja na SA2 e ignora linha de controle", () => {
    const r = parseSa2("SA2\n\nCodigo;Loja;CNPJ/CPF;Razao Social;Endereco;Numero;CEP;Bairro;Municipio;Estado\n000001;01;12.345.678/0001-90;Fornecedor;Rua A;1;00000-000;Centro;Cidade;SP\n");
    expect(r.rows[0].supplierCode).toBe("000001"); expect(r.rows[0].store).toBe("01"); expect(r.duplicateRows).toBe(0);
  });
});
