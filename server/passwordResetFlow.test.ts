import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const service = fs.readFileSync(path.join(process.cwd(), "server/portalAuthService.ts"), "utf8");
const portal = fs.readFileSync(path.join(process.cwd(), "server/supabasePortal.ts"), "utf8");
const access = fs.readFileSync(path.join(process.cwd(), "client/src/pages/PortalAccess.tsx"), "utf8");

describe("fluxo próprio de ativação e redefinição", () => {
  it("usa token hash, expiração e uso único", () => {
    expect(service).toContain("portal_password_reset_tokens");
    expect(service).toContain("expires_at>now()");
    expect(service).toContain("used_at is null");
    expect(service).toContain("set used_at=now()");
  });
  it("gera links próprios sem e-mail Supabase", () => {
    expect(portal).not.toContain("auth/v1/recover");
    expect(portal).not.toContain("auth/v1/invite");
  });
  it("permite definir a senha pelo link sem alterar o leiaute", () => {
    expect(access).toContain("new URLSearchParams(window.location.search).get(\"reset\")");
    expect(access).toContain("setOwnPassword.mutateAsync");
  });
});
