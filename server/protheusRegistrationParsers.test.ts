import { describe, expect, it } from "vitest";
import { parseAgra045Xml, parseMata020Csv, parseSi3Csv } from "./protheusRegistrationParsers";

describe("leitores de cadastros Protheus", () => {
  it("mapeia automaticamente o CSV MATA020 pelo nome dos cabeçalhos", () => {
    const csv = `SA2\nTipo,Loja,Razao Social,Codigo,CNPJ/CPF,N Fantasia\nJuridico,01,Fornecedor A,000001,111,Comercial A\nJuridico,02,Fornecedor B,000001,222,Comercial B`;
    expect(parseMata020Csv(csv).rows).toEqual([
      { codigo_fornecedor: "000001", loja_fornecedor: "01", razao_social: "Fornecedor A", cnpj_cpf: "111", nome_fantasia: "Comercial A", ativo: "SIM" },
      { codigo_fornecedor: "000001", loja_fornecedor: "02", razao_social: "Fornecedor B", cnpj_cpf: "222", nome_fantasia: "Comercial B", ativo: "SIM" },
    ]);
  });

  it("mapeia automaticamente o CSV SI3 por filial, código e descrição do centro de custo", () => {
    const csv = `SI3\r\n"Filial","Cod Custo","Desc CCusto","Cod.Munic.","% Empresa","Ret.11%"\r\n"0101","10101","GERENCIA ADMINISTRATIVA","","0",""`;
    expect(parseSi3Csv(csv).rows).toEqual([{ codigo_filial: "0101", codigo: "10101", nome: "GERENCIA ADMINISTRATIVA", codigo_municipio: "", percentual_empresa: "0", retencao_11: "", ativo: "SIM" }]);
  });

  it("preserva o mesmo código quando ele pertence a filiais diferentes", () => {
    const csv = `SI3\r\n"Filial","Cod Custo","Desc CCusto","Cod.Munic.","% Empresa","Ret.11%"\r\n"0101","101","ADMINISTRATIVO","","0",""\r\n"0102","101","ADMINISTRATIVO","","0",""`;
    expect(parseSi3Csv(csv).rows.map(row => [row.codigo_filial, row.codigo])).toEqual([["0101", "101"], ["0102", "101"]]);
  });

  it("mapeia armazéns do XML AGRA045 por empresa, filial, código e descrição", () => {
    const xml = `<Workbook><Worksheet ss:Name="01-0101 - Listagem do Browse"><Table><Row><Cell><Data><![CDATA[Codigo]]></Data></Cell><Cell><Data><![CDATA[Descricao]]></Data></Cell></Row><Row><Cell><Data><![CDATA[01]]></Data></Cell><Cell><Data><![CDATA[DISPONIVEL]]></Data></Cell></Row></Table></Worksheet></Workbook>`;
    expect(parseAgra045Xml(xml).rows).toEqual([{ codigo_empresa: "01", codigo_filial: "0101", codigo: "01", nome: "DISPONIVEL", ativo: "SIM" }]);
  });
});
