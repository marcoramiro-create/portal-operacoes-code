import { describe, expect, it } from "vitest";
import { createSessionToken, hashPortalPassword, sessionTokenHash, verifyPortalPassword } from "./portalAuthService";

describe("autenticação própria — primitives", () => {
  it("gera hash não reversível e valida a senha", async () => {
    const hash = await hashPortalPassword("Senha segura de teste 123!");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash).not.toContain("Senha segura de teste 123!");
    await expect(verifyPortalPassword("Senha segura de teste 123!", hash)).resolves.toBe(true);
    await expect(verifyPortalPassword("senha incorreta", hash)).resolves.toBe(false);
  });

  it("gera token de sessão que não é persistido em claro", () => {
    const token = createSessionToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(sessionTokenHash(token)).not.toBe(token);
    expect(sessionTokenHash(token)).toHaveLength(64);
  });
});
