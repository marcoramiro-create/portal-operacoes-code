import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const service = fs.readFileSync(path.join(process.cwd(), "server/portalAuthService.ts"), "utf8");
const router = fs.readFileSync(path.join(process.cwd(), "server/routers/portal.ts"), "utf8");
const access = fs.readFileSync(path.join(process.cwd(), "client/src/pages/PortalAccess.tsx"), "utf8");
const users = fs.readFileSync(path.join(process.cwd(), "client/src/pages/UserManagement.tsx"), "utf8");

describe("fluxo próprio de ativação e redefinição", () => {
  it("usa token hash, expiração e uso único", () => {
    expect(service).toContain("portal_password_reset_tokens");
    expect(service).toContain("expires_at>now()");
    expect(service).toContain("used_at is null");
    expect(service).toContain("set used_at=now()");
  });
  it("liga a administração ao serviço próprio e não ao e-mail legado", () => {
    expect(router).toContain("passwordFlowService");
    expect(router).toContain("resendPortalInvite");
    expect(router).toContain("resendPortalActivation");
    expect(router).not.toContain("auth/v1/recover");
    expect(router).not.toContain("auth/v1/invite");
    expect(access).not.toContain("resetPasswordForEmail");
    expect(users).toContain("copyPasswordLink");
  });
  it("permite definir a senha pelo link", () => {
    expect(access).toContain("new URLSearchParams(window.location.search).get(\"reset\")");
    expect(access).toContain("setOwnPassword.mutateAsync");
  });
});
