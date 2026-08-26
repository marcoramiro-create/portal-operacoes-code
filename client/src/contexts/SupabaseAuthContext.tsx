import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { passwordSetupCallbackOnLoad, supabase } from "@/lib/supabase";
import { isPasswordSetupCallback } from "@/lib/supabaseAuthFlow";

type SupabaseAuthContextValue = {
  session: Session | null;
  loading: boolean;
  passwordSetupRequired: boolean;
  clearPasswordSetupRequired: () => void;
};

const SupabaseAuthContext = createContext<SupabaseAuthContextValue | null>(null);

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordSetupRequired, setPasswordSetupRequired] = useState(() => passwordSetupCallbackOnLoad);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY" || isPasswordSetupCallback(window.location.hash)) setPasswordSetupRequired(true);
      setLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const value = useMemo(() => ({
    session,
    loading,
    passwordSetupRequired,
    clearPasswordSetupRequired: () => {
      setPasswordSetupRequired(false);
      window.history.replaceState({}, document.title, window.location.pathname);
    },
  }), [loading, passwordSetupRequired, session]);

  return <SupabaseAuthContext.Provider value={value}>{children}</SupabaseAuthContext.Provider>;
}

export function useSupabaseAuth() {
  const context = useContext(SupabaseAuthContext);
  if (!context) throw new Error("useSupabaseAuth deve ser utilizado dentro do SupabaseAuthProvider.");
  return context;
}
