export type RegistrationCapabilities = { view: boolean; create: boolean; import: boolean; manage: boolean };

export function canShowRegistrationManagement(capabilities: RegistrationCapabilities | undefined) {
  return Boolean(capabilities?.manage);
}
