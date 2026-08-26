import { describe, expect, it } from "vitest";
import { isPasswordSetupCallback } from "../client/src/lib/supabaseAuthFlow";

describe("retorno de ativação do portal", () => {
  it("identifica os callbacks de convite e redefinição antes da sessão consumir a URL", () => {
    expect(isPasswordSetupCallback("#access_token=token&refresh_token=refresh&type=recovery")).toBe(true);
    expect(isPasswordSetupCallback("#access_token=token&type=invite")).toBe(true);
    expect(isPasswordSetupCallback("#access_token=token&type=signup")).toBe(false);
  });
});
