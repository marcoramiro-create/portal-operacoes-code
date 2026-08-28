import { describe, expect, it } from "vitest";
import { assetNodeKey, calibrationApplies, canTransitionMaintenance } from "./assetMaintenanceRules";

describe("regras de Ativos e manutenção", () => {
  it("mapeia cada tipo de ativo para seu nó de permissão", () => {
    expect(assetNodeKey("forklift")).toBe("ativos-empilhadeiras");
    expect(assetNodeKey("industrial_equipment")).toBe("ativos-equipamentos-industria");
    expect(assetNodeKey("tool")).toBe("ativos-ferramentas");
  });
  it("permite somente transições operacionais válidas", () => {
    expect(canTransitionMaintenance("requested", "approved")).toBe(true);
    expect(canTransitionMaintenance("approved", "completed")).toBe(false);
    expect(canTransitionMaintenance("in_progress", "completed")).toBe(true);
    expect(canTransitionMaintenance("completed", "in_progress")).toBe(false);
  });
  it("trata calibração como opcional por tipo", () => {
    const now = new Date("2026-08-28T00:00:00.000Z");
    expect(calibrationApplies(false, new Date("2020-01-01T00:00:00.000Z"), now)).toBe(false);
    expect(calibrationApplies(true, new Date("2020-01-01T00:00:00.000Z"), now)).toBe(true);
    expect(calibrationApplies(true, new Date("2030-01-01T00:00:00.000Z"), now)).toBe(false);
  });
});
