import { ExternalLink, LoaderCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function OneDriveImportSource() {
  const source = trpc.portal.oneDriveSource.useQuery(undefined, { retry: false });

  return (
    <section className="sc-surface mb-5 border border-[#d7e7f4] bg-[#f7fbfe] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow text-sky-800">Origem semiassistida</p>
          <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">
            OneDrive · 01_Importacoes_Originais
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">
            {source.isLoading
              ? "Verificando a pasta compartilhada…"
              : source.data?.message ??
                "Abra a pasta compartilhada, baixe o arquivo desejado e use o envio manual abaixo para validar antes de gravar."}
          </p>
        </div>
        {source.isLoading ? (
          <LoaderCircle className="h-5 w-5 animate-spin text-slate-500" />
        ) : source.data?.link ? (
          <a
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
            href={source.data.link}
            target="_blank"
            rel="noreferrer"
          >
            Abrir pasta <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
      </div>
      {source.data?.reachable && (
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">
          Link público confirmado · somente leitura
        </p>
      )}
      {source.error && (
        <p className="mt-4 text-xs font-semibold text-amber-800">
          Não foi possível consultar a origem agora. O envio manual abaixo continua disponível.
        </p>
      )}
    </section>
  );
}
