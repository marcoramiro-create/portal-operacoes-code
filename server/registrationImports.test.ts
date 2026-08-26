import { describe, expect, it } from "vitest";
import { validateRegistrationRows } from "./registrationImports";

describe("validação de leiautes de cadastro", () => {
  it("aponta campos obrigatórios de uma linha de produto incompleta", () => {
    const result = validateRegistrationRows("products", [{ codigo_produto: "", nome_produto: "", tipo_produto: "", ativo: "SIM" }]);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(2);
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
});
