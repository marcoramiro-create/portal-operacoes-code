import { describe, expect, it } from "vitest";
import { isPasswordSetupCallback } from "./supabaseAuthFlow";

describe("callback de ativação do Supabase", () => {
  it("reconhece o retorno de redefinição de senha no fragmento da URL", () => {
    expect(isPasswordSetupCallback("#access_token=token&refresh_token=refresh&type=recovery")).toBe(true);
  });

  it("reconhece o retorno de convite e ignora uma sessão comum", () => {
    expect(isPasswordSetupCallback("#access_token=token&type=invite")).toBe(true);
    expect(isPasswordSetupCallback("#access_token=token&type=signup")).toBe(false);
  });
});
