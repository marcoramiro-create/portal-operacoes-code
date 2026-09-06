import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { LockKeyhole, ServerCrash } from "lucide-react";
import { useLocation } from "wouter";

type Level = "view" | "manage" | "approve";

export function ApplicationRouteGuard({ nodeKey, level = "view", children }: { nodeKey: string; level?: Level; children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const permission = trpc.portal.applicationPermissions.useQuery({ nodeKey }, { retry: false });

  if (permission.isLoading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-950" />
      </div>
    );
  }

  // Descobre o status HTTP do erro (quando a API conseguiu responder)
  const httpStatus: number | undefined =
    (permission.error as { data?: { httpStatus?: number } } | undefined)?.data?.httpStatus ??
    (permission.error as { shape?: { data?: { httpStatus?: number } } } | undefined)?.shape?.data?.httpStatus;

  // Erro de servidor (500 / timeout) OU erro sem resposta HTTP (rede caiu) → mensagem de servidor lento
  if (permission.error && (!httpStatus || httpStatus >= 500)) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-900">
          <ServerCrash className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-slate-950">O servidor demorou para responder</h1>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
          A consulta levou mais tempo que o permitido e a conexão foi interrompida. Tente novamente em alguns instantes. Se o problema persistir, avise o administrador.
        </p>
        <Button className="mt-6 bg-slate-950 hover:bg-slate-800" onClick={() => setLocation("/")}>Voltar ao portal</Button>
      </div>
    );
  }

  // Demais erros (ex.: 403 = sem permissão) ou permissão negada → "Acesso não liberado"
  if (permission.error || !permission.data?.[level]) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-900">
          <LockKeyhole className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-slate-950">Acesso não liberado</h1>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">Este módulo não está liberado para o seu usuário. Solicite ao administrador a permissão necessária.</p>
        <Button className="mt-6 bg-slate-950 hover:bg-slate-800" onClick={() => setLocation("/")}>Voltar ao portal</Button>
      </div>
    );
  }

  return <>{children}</>;
}