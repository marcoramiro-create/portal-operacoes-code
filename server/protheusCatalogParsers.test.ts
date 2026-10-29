import { describe, expect, it } from "vitest";
import { createSb9StreamParser, parseSa2, parseSb1, parseSb5, parseSb9, parseSbz, parseZfm, parseZsf } from "./protheusCatalogParsers";

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
  it("lê ZFM com cabeçalho na linha 4 e preserva zeros à esquerda", () => {
    const r = parseZfm("Famílias\n\nExportação\nCódigo;Descrição\n0000002;ACESSORIOS\n0000021;FAMÍLIA FINAL\n");
    expect(r.rows).toEqual([
      { code: "0000002", description: "ACESSORIOS" },
      { code: "0000021", description: "FAMÍLIA FINAL" },
    ]);
    expect(r.sourceRows).toBe(2);
  });
  it("lê ZSF com cabeçalho na linha 4, preserva zeros e espaços internos", () => {
    const r = parseZsf("SubFamília\n\nCadastro Protheus\nCódigo;Descrição\n0000046;DESCRIÇÃO  COM DOIS ESPAÇOS\n0000064;OUTRA DESCRIÇÃO\n");
    expect(r.rows[0]).toEqual({ code: "0000046", description: "DESCRIÇÃO  COM DOIS ESPAÇOS" });
    expect(r.rows[1].code).toBe("0000064");
  });
  it("lê SB9 com cabeçalho deslocado e usa C Unit 1a M como custo", () => {
    const r = parseSb9("SB9\n\nFilial;Produto;Armazem;Data Saldo;Qtd.Inic.Mes;Sld.Ini.Mes;Grupo;Cod. Produto;Custo Stand.;C Unit 1a M\n0105;000123-MGT;01;31/01/2025;10;25,50;0002;000123-MGT;9,99;1.234,56\n");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ branchCode: "0105", productCode: "000123-MGT", balanceDateIso: "2025-01-31", unitCost1aM: "1.234,56", unitCost1aMValue: 1234.56 });
  });
  it("processa SB9 em pedaços e não acumula linhas quando há callback", () => {
    const content = Buffer.from("SB9\n\nFilial;Produto;Armazem;Data Saldo;C Unit 1a M\n0105;000001;01;31/01/2025;10,00\n0105;000002;01;28/02/2025;20,00\n", "latin1");
    const rows: string[] = [];
    const parser = createSb9StreamParser(row => rows.push(row.productCode));
    for (let start = 0; start < content.length; start += 7) parser.push(content.subarray(start, start + 7));
    const result = parser.finish();
    expect(rows).toEqual(["000001", "000002"]);
    expect(result.rows).toHaveLength(0);
    expect(result.sourceRows).toBe(2);
  });
});
