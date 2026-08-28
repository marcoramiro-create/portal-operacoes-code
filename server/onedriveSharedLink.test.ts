import { describe, expect, it } from "vitest";

describe("OneDrive shared imports link", () => {
  it("opens the configured read-only folder page", async () => {
    const link = process.env.ONEDRIVE_IMPORTS_LINK;
    expect(link).toMatch(/^https:\/\/1drv\.ms\/f\//);

    const response = await fetch(link!, { method: "HEAD", redirect: "manual" });
    expect([301, 302, 307, 308]).toContain(response.status);
    expect(response.headers.get("location")).toContain("onedrive.live.com");
  }, 30_000);
});
