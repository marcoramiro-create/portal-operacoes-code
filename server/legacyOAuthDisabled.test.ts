import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");

describe("OAuth legado desativado", () => {
  it("não registra callback no servidor sem OAUTH_SERVER_URL", () => {
    const source = readFileSync(path.join(projectRoot, "server/_core/oauth.ts"), "utf8");
    expect(source).toContain("if (!ENV.oAuthServerUrl)");
    expect(source).toContain("return;");
  });

  it("não trata a ausência de OAUTH_SERVER_URL como erro fatal", () => {
    const source = readFileSync(path.join(projectRoot, "server/_core/sdk.ts"), "utf8");
    expect(source).toContain("Legacy OAuth disabled");
    expect(source).not.toContain("OAUTH_SERVER_URL is not configured!");
  });

  it("não redireciona o navegador quando o OAuth legado está sem configuração", () => {
    const source = readFileSync(path.join(projectRoot, "client/src/const.ts"), "utf8");
    expect(source).toContain("if (!oauthPortalUrl || !appId)");
    expect(source).toContain("Legacy OAuth is disabled");
  });
});
