import { Download, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";

export default function OneDriveImportSource() {
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const source = trpc.portal.oneDriveSource.useQuery(undefined, { retry: false });
  const connection = trpc.portal.oneDriveConnection.useQuery(undefined, { retry: false });
  const files = trpc.portal.oneDriveFiles.useQuery(undefined, { retry: false, enabled: Boolean(connection.data?.connected) });

  async function connectOneDrive() {
    setConnecting(true);
    setConnectError(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Sua sessão expirou. Entre novamente no portal.");
      const response = await fetch("/api/onedrive/connect", {
        headers: { Authorization: `Bearer ${data.session.access_token}`, Accept: "application/json" },
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => null) as { url?: string; message?: string } | null;
      if (!response.ok || !payload?.url) throw new Error(payload?.message ?? "Não foi possível iniciar a conexão com o OneDrive.");
      window.location.assign(payload.url);
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : "Não foi possível iniciar a conexão com o OneDrive.");
      setConnecting(false);
    }
  }

  return (
    <section className="sc-surface mb-5 border border-[#d7e7f4] bg-[#f7fbfe] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow text-sky-800">Origem semiassistida</p>
          <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">OneDrive · 01_Importacoes_Originais</h2>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">
            {source.isLoading ? "Verificando a pasta compartilhada…" : source.data?.message ?? "Conecte o OneDrive corporativo para consultar os arquivos disponíveis e validar cada importação antes de gravar."}
          </p>
        </div>
        {source.isLoading ? (
          <LoaderCircle className="h-5 w-5 animate-spin text-slate-500" />
        ) : connection.data?.connected ? (
          <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-100 px-4 py-2.5 text-sm font-bold text-emerald-800">OneDrive conectado</span>
        ) : (
          <button type="button" disabled={connecting} onClick={connectOneDrive} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">
            {connecting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {connecting ? "Conectando…" : "Conectar OneDrive"}
          </button>
        )}
        {source.data?.link && !connection.data?.connected ? (
          <a className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800" href={source.data.link} target="_blank" rel="noreferrer">Abrir pasta <ExternalLink className="h-4 w-4" /></a>
        ) : null}
      </div>
      {connectError ? <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{connectError}</p> : null}
      {source.data?.reachable && <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">Link público confirmado · somente leitura</p>}
      {source.error && <p className="mt-4 text-xs font-semibold text-amber-800">Não foi possível consultar a origem agora. O envio manual abaixo continua disponível.</p>}
      {connection.data?.connected && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-extrabold text-slate-950">Arquivos disponíveis</p><p className="text-xs text-slate-500">Leitura somente de {connection.data.folderPath}.</p></div><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700" onClick={() => files.refetch()}><RefreshCw className="h-3.5 w-3.5" />Atualizar</button></div>
          {files.isLoading ? <p className="mt-3 text-sm text-slate-500">Lendo arquivos…</p> : files.data?.files.length ? <ul className="mt-3 divide-y divide-slate-100">{files.data.files.map(file => <li key={file.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0 truncate font-semibold text-slate-700">{file.name}</span><a className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white" href={`/api/onedrive/file?itemId=${encodeURIComponent(file.id)}&name=${encodeURIComponent(file.name)}`}><Download className="h-3.5 w-3.5" />Baixar</a></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">Nenhum arquivo encontrado nessa pasta.</p>}
        </div>
      )}
    </section>
  );
}
