import { describe, expect, it } from "vitest";
import { applicationPaths, PORTAL_HOME_PATH } from "../client/src/lib/portalNavigation";

describe("portal navigation", () => {
  it("keeps the root route as the neutral portal home", () => {
    expect(PORTAL_HOME_PATH).toBe("/");
  });

  it("uses a dedicated route for the Protheus application", () => {
    expect(applicationPaths["compras-protheus"]).toBe("/compras/protheus");
  });
});
