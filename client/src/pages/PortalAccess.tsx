import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { isEmailRateLimitError, recoveryErrorMessage } from "@/lib/supabaseAuthErrors";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { KeyRound, Loader2, LockKeyhole, Send, ShieldCheck, UserRoundPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

type AccessMode = "login" | "request";

export default function PortalAccess() {
  const { session, passwordSetupRequired, clearPasswordSetupRequired } = useSupabaseAuth();
  const [mode, setMode] = useState<AccessMode>("login");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const requestAccess = trpc.portal.createAccessRequest.useMutation({
    onSuccess: () => { setMode("login"); setDisplayName(""); setReason(""); toast.success("Solicitação enviada para revisão."); },
    onError: error => toast.error(error.message),
  });

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (error) return toast.error("Não foi possível entrar. Verifique o e-mail e a senha.");
    toast.success("Acesso autenticado.");
  };

  const definePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 12) return toast.error("Use uma senha com pelo menos 12 caracteres.");
    if (password !== confirmPassword) return toast.error("As senhas não coincidem.");
    setPending(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) return toast.error(error.message);
    clearPasswordSetupRequired();
    toast.success("Senha definida com sucesso.");
  };

  const sendRecovery = async () => {
    if (!email) return toast.error("Informe seu e-mail para receber a redefinição de senha.");
    if (recoveryRequested) return toast.message("A solicitação já foi feita. Verifique o e-mail antes de pedir outro link.");
    setPending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: "https://gestaolog-ehcfqbaf.manus.space" });
    setPending(false);
    if (error) {
      if (isEmailRateLimitError(error.message)) setRecoveryRequested(true);
      return toast.error(recoveryErrorMessage(error.message));
    }
    setRecoveryRequested(true);
    toast.success("Se o e-mail estiver liberado, você receberá um link de redefinição.");
  };

  const isPasswordSetup = Boolean(session && passwordSetupRequired);

  return <div className="min-h-screen bg-[#f2f4f5] p-5 sm:p-10"><div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-[0_24px_70px_rgba(36,48,66,0.12)] lg:grid-cols-[1.15fr_0.85fr]"><section className="relative overflow-hidden bg-slate-950 p-8 text-white sm:p-12"><span className="absolute -right-14 -top-16 h-60 w-60 rounded-full bg-[#9fc7ea]" /><span className="absolute -bottom-20 right-24 h-52 w-52 rounded-[38%] bg-[#e7b9c9]" /><div className="relative flex h-full max-w-md flex-col justify-between"><div><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-950"><ShieldCheck className="h-5 w-5" /></div><p className="mt-9 text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#b8d5ef]">Portal Operações</p><h1 className="mt-3 text-4xl font-extrabold tracking-[-0.06em] sm:text-5xl">Acesso controlado para cada operação.</h1><p className="mt-5 text-sm font-medium leading-6 text-slate-300">Aplicações, cadastros e dados disponíveis de acordo com as permissões liberadas para o seu usuário.</p></div><p className="relative mt-12 text-xs font-semibold text-slate-400">Ambiente de homologação</p></div></section><section className="flex items-center p-7 sm:p-12"><div className="w-full max-w-sm"><div className="mb-8"><p className="eyebrow">{isPasswordSetup ? "Ativação de conta" : mode === "request" ? "Solicitação de acesso" : "Acesso ao portal"}</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-0.05em] text-slate-950">{isPasswordSetup ? "Defina sua senha" : mode === "request" ? "Solicite seu acesso" : "Entre para continuar"}</h2><p className="mt-3 text-sm font-medium leading-6 text-slate-500">{isPasswordSetup ? "Crie uma senha exclusiva para o portal. Ela não será armazenada pela aplicação." : mode === "request" ? "A solicitação será encaminhada a um administrador para análise." : "Use o e-mail e a senha definidos no convite de ativação."}</p></div>{isPasswordSetup ? <form className="grid gap-5" onSubmit={definePassword}><label className="grid gap-2"><Label>Nova senha</Label><Input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required /></label><label className="grid gap-2"><Label>Confirmar nova senha</Label><Input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></label><Button type="submit" disabled={pending} className="mt-2 bg-slate-950 text-white hover:bg-slate-800">{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}Definir senha e entrar</Button></form> : mode === "request" ? <form className="grid gap-5" onSubmit={event => { event.preventDefault(); requestAccess.mutate({ email, displayName, reason: reason || undefined }); }}><label className="grid gap-2"><Label>Nome</Label><Input value={displayName} onChange={event => setDisplayName(event.target.value)} required /></label><label className="grid gap-2"><Label>E-mail corporativo</Label><Input type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label><label className="grid gap-2"><Label>Justificativa</Label><Input value={reason} onChange={event => setReason(event.target.value)} /></label><Button type="submit" disabled={requestAccess.isPending} className="mt-2 bg-slate-950 text-white hover:bg-slate-800">{requestAccess.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Enviar solicitação</Button><button type="button" className="text-sm font-bold text-slate-600 hover:text-slate-950" onClick={() => setMode("login")}>Voltar ao login</button></form> : <form className="grid gap-5" onSubmit={signIn}><label className="grid gap-2"><Label>E-mail</Label><Input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label><label className="grid gap-2"><Label>Senha</Label><Input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label><Button type="submit" disabled={pending} className="mt-2 bg-slate-950 text-white hover:bg-slate-800">{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="mr-2 h-4 w-4" />}Entrar no portal</Button><div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-slate-600"><button type="button" disabled={recoveryRequested} className="disabled:cursor-not-allowed disabled:opacity-50 hover:text-slate-950" onClick={sendRecovery}>Esqueci minha senha</button><button type="button" className="flex items-center gap-1 hover:text-slate-950" onClick={() => setMode("request")}><UserRoundPlus className="h-3.5 w-3.5" />Solicitar acesso</button></div>{recoveryRequested && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">Já houve uma solicitação de e-mail. Aguarde antes de tentar novamente e utilize apenas o link mais recente recebido.</p>}</form>}</div></section></div></div>;
}
