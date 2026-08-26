import { createClient } from "@supabase/supabase-js";
import { isPasswordSetupCallback } from "./supabaseAuthFlow";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("A autenticação do portal não foi configurada.");
}

// O cliente Supabase consome o fragmento da URL durante sua inicialização.
// Preserve este sinal antes da criação do cliente para abrir a tela de senha.
export const passwordSetupCallbackOnLoad = isPasswordSetupCallback(window.location.hash);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
