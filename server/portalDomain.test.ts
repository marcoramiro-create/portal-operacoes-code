import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const currentPortalUrl = "https://portal-operacoes-megatec.duckdns.org";
const legacyPortalUrl = "https://gestaolog-ehcfqbaf.manus.space";

const redirectFiles = [
  "client/src/pages/PortalAccess.tsx",
  "server/supabasePortal.ts",
  "scripts/resend-admin-password-recovery.mjs",
  "scripts/resend-homologation-activation.mjs",
  "scripts/resend-operator-password-recovery.mjs",
];

describe("domínio público do portal", () => {
  it("mantém os redirecionamentos de autenticação no domínio oficial atual", () => {
    for (const relativePath of redirectFiles) {
      const source = readFileSync(path.join(projectRoot, relativePath), "utf8");
      expect(source, relativePath).toContain(currentPortalUrl);
      expect(source, relativePath).not.toContain(legacyPortalUrl);
    }
  });
});
