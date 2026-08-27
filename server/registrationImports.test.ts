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

  it("aceita uma linha de fornecedor preenchida com os campos mínimos", () => {
    const result = validateRegistrationRows("suppliers", [{ codigo_fornecedor: "FOR-001", razao_social: "Fornecedor de Teste", nome_fantasia: "", cnpj_cpf: "", ativo: "SIM" }]);
    expect(result.valid).toBe(true);
    expect(result.totalRows).toBe(1);
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
