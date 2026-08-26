import { describe, expect, it } from "vitest";
import { isEmailRateLimitError, recoveryErrorMessage } from "./supabaseAuthErrors";

describe("mensagens de recuperação Supabase", () => {
  it("reconhece o limite temporário de e-mails", () => {
    expect(isEmailRateLimitError("email rate limit exceeded")).toBe(true);
    expect(recoveryErrorMessage("email rate limit exceeded")).toContain("limitou temporariamente");
  });

  it("mantém uma mensagem segura para falhas desconhecidas", () => {
    expect(isEmailRateLimitError("invalid request")).toBe(false);
    expect(recoveryErrorMessage("invalid request")).toContain("Não foi possível");
  });
});
