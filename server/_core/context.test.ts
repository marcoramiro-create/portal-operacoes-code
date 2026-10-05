import { describe, expect, it, vi } from "vitest";
import { createContext } from "./context";
import { sdk } from "./sdk";

vi.mock("./sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));

describe("createContext", () => {
  it("não envia Bearer Supabase ao verificador OAuth legado", async () => {
    const authenticateRequest = vi.mocked(sdk.authenticateRequest);
    const context = await createContext({ req: { headers: { authorization: "Bearer supabase-token" } } as any, res: {} as any });
    expect(authenticateRequest).not.toHaveBeenCalled();
    expect(context.user).toBeNull();
  });
  it("mantém o fluxo legado quando não há Bearer", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValueOnce({ id: 1 } as any);
    const context = await createContext({ req: { headers: {} } as any, res: {} as any });
    expect(sdk.authenticateRequest).toHaveBeenCalled();
    expect(context.user).toMatchObject({ id: 1 });
  });
});
