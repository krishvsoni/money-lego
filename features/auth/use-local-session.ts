"use client";

import { useEffect, useState } from "react";

export interface LocalSession {
  loaded: boolean;
  // Set only for an email + password account; Clerk users are reported by Clerk's own hooks.
  name: string | null;
}

export function useLocalSession(): LocalSession {
  const [session, setSession] = useState<LocalSession>({ loaded: false, name: null });
  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => active && setSession({ loaded: true, name: result.user?.kind === "local" ? result.user.name : null }))
      .catch(() => active && setSession({ loaded: true, name: null }));
    return () => {
      active = false;
    };
  }, []);
  return session;
}

export async function signOutLocal(): Promise<void> {
  await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
  window.location.reload();
}
