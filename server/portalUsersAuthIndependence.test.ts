import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const service = fs.readFileSync(path.join(process.cwd(), "server/supabasePortal.ts"), "utf8");

describe("gestão de usuários sem auth.users", () => {
  it("listPortalUsers não consulta auth.users e usa senha própria como ativação", () => {
    expect(service).toContain("(u.password_hash is not null) as own_password_configured");
    expect(service).not.toContain("left join auth.users");
  });

  it("createPortalUser não envia convite do Supabase", () => {
    const createBlock = service.slice(service.indexOf("export async function createPortalUser"), service.indexOf("export async function assignProfile"));
    expect(createBlock).not.toContain("ensureAuthInvitation");
    expect(createBlock).toContain("insert into public.portal_users (email, display_name, status)");
  });

  it("resendActivationInvite orienta provisionamento seguro", () => {
    const resendBlock = service.slice(service.indexOf("export async function resendActivationInvite"), service.indexOf("export async function createAccessRequest"));
    expect(resendBlock).not.toContain("auth/v1/invite");
    expect(resendBlock).toContain("procedimento seguro na VM");
  });
});
