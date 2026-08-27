import { describe, expect, it } from "vitest";
import { parseMata020Xml } from "./mata020Xml";

const xml = `<?xml version="1.0"?><Workbook><Worksheet ss:Name="MATA020"><Table>
  <Row><Cell ss:Index="1"><Data><![CDATA[Codigo]]></Data></Cell><Cell ss:Index="2"><Data><![CDATA[Loja]]></Data></Cell><Cell ss:Index="3"><Data><![CDATA[CNPJ/CPF]]></Data></Cell><Cell ss:Index="4"><Data><![CDATA[Razao Social]]></Data></Cell><Cell ss:Index="5"><Data><![CDATA[N Fantasia]]></Data></Cell></Row>
  <Row><Cell><Data><![CDATA[000001]]></Data></Cell><Cell><Data><![CDATA[01]]></Data></Cell><Cell><Data><![CDATA[111]]></Data></Cell><Cell><Data><![CDATA[Fornecedor A]]></Data></Cell><Cell><Data><![CDATA[Comercial A]]></Data></Cell></Row>
  <Row><Cell><Data><![CDATA[000001]]></Data></Cell><Cell><Data><![CDATA[02]]></Data></Cell><Cell><Data><![CDATA[222]]></Data></Cell><Cell><Data><![CDATA[Fornecedor B]]></Data></Cell><Cell><Data><![CDATA[]]></Data></Cell></Row>
</Table></Worksheet></Workbook>`;

describe("leitor XML MATA020", () => {
  it("ignora cabeçalhos repetidos entre páginas da exportação", () => {
    const repeatedHeaderXml = `<?xml version="1.0"?><Workbook><Worksheet ss:Name="MATA020"><Table><Row><Cell><Data><![CDATA[Codigo]]></Data></Cell><Cell><Data><![CDATA[Loja]]></Data></Cell><Cell><Data><![CDATA[CNPJ/CPF]]></Data></Cell><Cell><Data><![CDATA[Razao Social]]></Data></Cell><Cell><Data><![CDATA[N Fantasia]]></Data></Cell></Row><Row><Cell><Data><![CDATA[000001]]></Data></Cell><Cell><Data><![CDATA[01]]></Data></Cell><Cell><Data><![CDATA[111]]></Data></Cell><Cell><Data><![CDATA[Fornecedor A]]></Data></Cell><Cell><Data><![CDATA[Comercial A]]></Data></Cell></Row><Row><Cell><Data><![CDATA[Codigo]]></Data></Cell><Cell><Data><![CDATA[Loja]]></Data></Cell><Cell><Data><![CDATA[CNPJ/CPF]]></Data></Cell><Cell><Data><![CDATA[Razao Social]]></Data></Cell><Cell><Data><![CDATA[N Fantasia]]></Data></Cell></Row><Row><Cell><Data><![CDATA[000002]]></Data></Cell><Cell><Data><![CDATA[01]]></Data></Cell><Cell><Data><![CDATA[222]]></Data></Cell><Cell><Data><![CDATA[Fornecedor B]]></Data></Cell><Cell><Data><![CDATA[Comercial B]]></Data></Cell></Row></Table></Worksheet></Workbook>`;
    const result = parseMata020Xml(repeatedHeaderXml);
    expect(result.sourceRows).toBe(2);
    expect(result.rows.map(row => row.codigo_fornecedor)).toEqual(["000001", "000002"]);
  });

  it("mapeia fornecedores ativos por código e loja, mantendo CNPJ distintos", () => {
    const result = parseMata020Xml(xml);
    expect(result.sourceRows).toBe(2);
    expect(result.skippedRows).toBe(0);
    expect(result.rows).toEqual([
      { codigo_fornecedor: "000001", loja_fornecedor: "01", cnpj_cpf: "111", razao_social: "Fornecedor A", nome_fantasia: "Comercial A", ativo: "SIM" },
      { codigo_fornecedor: "000001", loja_fornecedor: "02", cnpj_cpf: "222", razao_social: "Fornecedor B", nome_fantasia: "", ativo: "SIM" },
    ]);
  });
});
