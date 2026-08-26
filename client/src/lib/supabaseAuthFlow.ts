export function isPasswordSetupCallback(hash: string) {
  return /(?:^|[&#])type=(?:invite|recovery)(?:&|$)/.test(hash);
}
