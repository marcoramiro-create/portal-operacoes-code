import { describe, expect, it } from "vitest";
import { registrationValidationMessage, validateRegistrationRows } from "./registrationImports";

describe("validação de leiautes de cadastro", () => {
  it("aponta campos obrigatórios de uma linha de produto incompleta", () => {
    const result = validateRegistrationRows("products", [{ codigo_produto: "", nome_produto: "", codigo_tipo_produto: "", categoria_operacional: "", unidade_medida: "", controla_tamanho: "NÃO", controla_lote: "NÃO", controla_validade: "NÃO", controla_ca: "NÃO", ativo: "SIM" }]);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(5);
  });

  it("aceita os controles de produto no leiaute central", () => {
    const result = validateRegistrationRows("products", [{ codigo_produto: "EPI-001", nome_produto: "Luva de proteção", codigo_tipo_produto: "EPI", categoria_operacional: "EPI", unidade_medida: "PAR", controla_tamanho: "SIM", controla_lote: "SIM", controla_validade: "SIM", controla_ca: "SIM", ativo: "SIM" }]);
    expect(result.valid).toBe(true);
  });

  it("aceita uma linha de fornecedor preenchida com código e loja", () => {
    const result = validateRegistrationRows("suppliers", [{ codigo_fornecedor: "FOR-001", loja_fornecedor: "01", razao_social: "Fornecedor de Teste", nome_fantasia: "", cnpj_cpf: "", ativo: "SIM" }]);
    expect(result.valid).toBe(true);
    expect(result.totalRows).toBe(1);
  });

  it("permite o mesmo código em lojas diferentes e bloqueia somente a repetição da combinação", () => {
    const distinctStores = validateRegistrationRows("suppliers", [
      { codigo_fornecedor: "FOR-001", loja_fornecedor: "01", razao_social: "Fornecedor Loja 01", nome_fantasia: "", cnpj_cpf: "111", ativo: "SIM" },
      { codigo_fornecedor: "FOR-001", loja_fornecedor: "02", razao_social: "Fornecedor Loja 02", nome_fantasia: "", cnpj_cpf: "222", ativo: "SIM" },
    ]);
    const repeatedStore = validateRegistrationRows("suppliers", [
      { codigo_fornecedor: "FOR-001", loja_fornecedor: "01", razao_social: "Fornecedor Loja 01", nome_fantasia: "", cnpj_cpf: "111", ativo: "SIM" },
      { codigo_fornecedor: "FOR-001", loja_fornecedor: "01", razao_social: "Fornecedor Loja 01 Atualizado", nome_fantasia: "", cnpj_cpf: "222", ativo: "SIM" },
    ]);
    expect(distinctStores.valid).toBe(true);
    expect(repeatedStore.valid).toBe(false);
  });

  it("valida a data e a liberação de requisição no cadastro de funcionário", () => {
    const invalid = validateRegistrationRows("employees", [{ codigo_funcionario: "0001", nome_completo: "Pessoa", email: "", codigo_empresa: "", codigo_filial: "", codigo_unidade: "", codigo_centro_custo: "", departamento: "", cargo: "", codigo_gestor: "", data_admissao: "01/01/2026", requisitante_almoxarifado: "TALVEZ", ativo: "SIM" }]);
    expect(invalid.valid).toBe(false);
    expect(invalid.issues.map(issue => issue.field)).toEqual(expect.arrayContaining(["Tipo de pessoa", "Data de admissão", "Pode requisitar almoxarifado"]));
  });

  it("aceita CPF válido, normaliza a pontuação e preserva cartão opcional", () => {
    const result = validateRegistrationRows("employees", [{ codigo_funcionario: "0002", nome_completo: "Pessoa Física", tipo_pessoa: "pf", documento: "529.982.247-25", numero_cartao: "CART-02", data_admissao: "2026-01-02", requisitante_almoxarifado: "SIM", ativo: "SIM" }]);
    expect(result.valid).toBe(true);
    expect(result.rows[0]?.tipo_pessoa).toBe("PF");
    expect(result.rows[0]?.documento).toBe("52998224725");
  });

  it("rejeita CPF com dígito verificador incorreto e CNPJ inválido", () => {
    const cpf = validateRegistrationRows("employees", [{ codigo_funcionario: "0003", nome_completo: "CPF Inválido", tipo_pessoa: "PF", documento: "52998224726", ativo: "SIM" }]);
    const cnpj = validateRegistrationRows("employees", [{ codigo_funcionario: "0004", nome_completo: "CNPJ Inválido", tipo_pessoa: "PJ", documento: "11222333000182", ativo: "SIM" }]);
    expect(cpf.valid).toBe(false);
    expect(cpf.issues.some(issue => issue.field === "CPF")).toBe(true);
    expect(cnpj.valid).toBe(false);
    expect(cnpj.issues.some(issue => issue.field === "CNPJ")).toBe(true);
  });

  it("rejeita um perfil de usuário fora do catálogo permitido", () => {
    const result = validateRegistrationRows("users", [{ nome: "Usuário de Teste", email: "teste@empresa.com", perfil: "admin", ativo: "SIM" }]);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.field).toBe("Perfil");
  });

  it("diferencia o erro de cadastro direto do erro de importação por planilha", () => {
    const issue = [{ row: 2, field: "Código da unidade", message: "Unidade ativa não encontrada." }];
    expect(registrationValidationMessage("direct", issue)).toContain("Corrija o cadastro antes de salvar");
    expect(registrationValidationMessage("direct", issue)).toContain("Código da unidade");
    expect(registrationValidationMessage("spreadsheet", issue)).toContain("planilha");
  });
});
