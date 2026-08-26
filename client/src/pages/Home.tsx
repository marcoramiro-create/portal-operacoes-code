import { PanelLeft } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center py-10">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200/80 bg-white px-7 py-12 text-center shadow-[0_16px_45px_-30px_rgba(15,23,42,0.35)] sm:px-12">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d8ebfa] text-slate-950"><PanelLeft className="h-5 w-5" /></span>
        <p className="mt-6 text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Portal Operações</p>
        <h1 className="mt-3 text-2xl font-extrabold tracking-[-0.04em] text-slate-950 sm:text-3xl">Selecione uma aplicação</h1>
        <p className="mx-auto mt-4 max-w-md text-sm font-medium leading-6 text-slate-500">Use o painel lateral para acessar as aplicações disponíveis para o seu perfil.</p>
      </section>
    </div>
  );
}
