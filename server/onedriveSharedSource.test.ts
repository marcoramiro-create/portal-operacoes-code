import { afterEach, describe, expect, it, vi } from "vitest";
import { getOneDriveSourceStatus } from "./onedriveSharedLink";

describe("OneDrive semi-assisted source", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports the public redirect as a reachable read-only source", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 301,
        headers: { location: "https://onedrive.live.com/shared-folder" },
      }),
    );

    const result = await getOneDriveSourceStatus();

    expect(result).toMatchObject({
      configured: true,
      reachable: true,
      status: 301,
      folderScope: "01_Importacoes_Originais",
      listingAvailable: false,
    });
  });

  it("keeps the manual fallback available when Microsoft cannot be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network unavailable"));

    const result = await getOneDriveSourceStatus();

    expect(result.reachable).toBe(false);
    expect(result.message).toContain("envio manual");
  });
});
