"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

// Who is signed in, as the browser knows it: read once from /api/auth/session and shared by
// every component, so the nav and the page gate never disagree. The browser never holds a
// sign-in token; Kinde's and our own session cookies are httpOnly.

export interface AuthSession {
  loaded: boolean;
  user: { name: string; kind: "kinde" | "local" } | null;
  refresh: () => Promise<void>;
}

const SIGNED_OUT = { loaded: false, user: null };

const AuthSessionContext = createContext<AuthSession>({ ...SIGNED_OUT, refresh: async () => {} });

export const useAuthSession = () => useContext(AuthSessionContext);

async function loadSession(): Promise<Omit<AuthSession, "refresh">> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    const body = (await res.json()) as { user: AuthSession["user"] };
    return { loaded: true, user: body.user };
  } catch {
    return { loaded: true, user: null };
  }
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<AuthSession, "refresh">>(SIGNED_OUT);

  useEffect(() => {
    let active = true;
    void loadSession().then((next) => active && setState(next));
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => setState(await loadSession()), []);

  return <AuthSessionContext.Provider value={{ ...state, refresh }}>{children}</AuthSessionContext.Provider>;
}

// Ends an email + password session. A Kinde session ends with a plain link to
// /api/auth/logout, which also signs out on Kinde's side and returns to
// KINDE_POST_LOGOUT_REDIRECT_URL.
export async function signOutLocal() {
  await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
  window.location.reload();
}
