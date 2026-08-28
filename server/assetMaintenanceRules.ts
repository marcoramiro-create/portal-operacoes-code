export type AssetType = "forklift" | "industrial_equipment" | "tool";
export type MaintenanceStatus = "requested" | "approved" | "in_progress" | "waiting_parts" | "completed" | "cancelled";

export function assetNodeKey(type: AssetType) { return type === "forklift" ? "ativos-empilhadeiras" : type === "industrial_equipment" ? "ativos-equipamentos-industria" : "ativos-ferramentas"; }
export function canTransitionMaintenance(from: MaintenanceStatus, to: MaintenanceStatus) {
  const transitions: Record<MaintenanceStatus, MaintenanceStatus[]> = { requested: ["approved", "cancelled"], approved: ["in_progress", "cancelled"], in_progress: ["waiting_parts", "completed", "cancelled"], waiting_parts: ["in_progress", "cancelled"], completed: [], cancelled: [] };
  return transitions[from].includes(to);
}
export function calibrationApplies(calibrationRequired: boolean, dueAt: Date | null, now = new Date()) { return calibrationRequired && (!dueAt || dueAt.getTime() <= now.getTime()); }
