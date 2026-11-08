/**
 * Desconecta o OneDrive do usuário logado: revoga o token no Graph
 * (best-effort) e apaga a conexão local. A conexão de SERVIÇO
 * (usada pelos jobs de redução/sync) é outra linha da tabela e
 * permanece intacta.
 */
export async function oneDriveDisconnect(req: Request) {
  const identity = await currentAdmin(req);
  const connection = await getConnection(identity.id);
  if (connection) {
    try {
      const active = await usableConnection(identity.id);
      if (active) {
        await fetch(`${AUTHORITY}/oauth2/v2.0/logout`, { signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
      }
    } catch {
      // Revogação remota é best-effort; a remoção local é o que vale.
    }
    await getSupabasePool().query("delete from public.portal_onedrive_connections where user_id=$1", [identity.id]);
  }
  return { connected: false };
}
