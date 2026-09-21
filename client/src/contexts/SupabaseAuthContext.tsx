import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { passwordSetupCallbackOnLoad, supabase } from "@/lib/supabase";
import { isPasswordSetupCallback } from "@/lib/supabaseAuthFlow";
import { trpc } from "@/lib/trpc";

type SupabaseAuthContextValue = {
  session: Session | null;
  loading: boolean;
  passwordSetupRequired: boolean;
  clearPasswordSetupRequired: () => void;
  signOut: () => Promise<{ error: Error | null }>;
  portalIdentity: { id: string; email: string; displayName: string | null; isDevelopmentAdmin: boolean; profiles: string[] } | null;
};

const SupabaseAuthContext = createContext<SupabaseAuthContextValue | null>(null);

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordSetupRequired, setPasswordSetupRequired] = useState(() => passwordSetupCallbackOnLoad);
  const portalMe = trpc.portal.me.useQuery(undefined, { retry: false, staleTime: 30_000 });
  const ownLogout = trpc.auth.logout.useMutation();

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
    portalIdentity: portalMe.data ?? null,
    signOut: async () => {
      await ownLogout.mutateAsync().catch(() => undefined);
      const { error } = await supabase.auth.signOut();
      if (!error) {
        setSession(null);
        setPasswordSetupRequired(false);
        window.history.replaceState({}, document.title, "/");
      }
      return { error };
    },
  }), [loading, passwordSetupRequired, session, portalMe.data, ownLogout]);

  return <SupabaseAuthContext.Provider value={value}>{children}</SupabaseAuthContext.Provider>;
}

export function useSupabaseAuth() {
  const context = useContext(SupabaseAuthContext);
  if (!context) throw new Error("useSupabaseAuth deve ser utilizado dentro do SupabaseAuthProvider.");
  return context;
}
