import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const context = fs.readFileSync(path.join(process.cwd(), "server/_core/context.ts"), "utf8");

describe("contexto tRPC — sessão própria", () => {
  it("não envia PortalSession para o autenticador OAuth legado", () => {
    expect(context).toContain("hasPortalSession");
    expect(context).toContain("!hasBearer && !hasPortalSession");
    expect(context).toContain("PortalSession");
  });
});
