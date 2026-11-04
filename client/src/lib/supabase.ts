import { createClient } from "@supabase/supabase-js";
import { isPasswordSetupCallback } from "./supabaseAuthFlow";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// O cliente Supabase consome o fragmento da URL durante sua inicialização.
// Preserve este sinal antes da criação do cliente para abrir a tela de senha.
export const passwordSetupCallbackOnLoad = isPasswordSetupCallback(window.location.hash);

// A autenticação própria do Portal usa portal_users/portal_sessions e não depende
// do Supabase Auth. O cliente legado é criado somente quando configurado.
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
