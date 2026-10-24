"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { api, errorMessage } from "@/lib/api-client";
import { buildSignInMessage, type SignInPayload } from "@/lib/auth-message";

type Status = "loading" | "signed-out" | "signed-in";

interface SessionValue {
  status: Status;
  wallet: string | null;
  // The wallet extension switched accounts after sign-in. Actions stay blocked until the
  // person signs in as the new wallet or switches back.
  mismatch: boolean;
  signingIn: boolean;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  error: string | null;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, disconnect } = useWallet();
  const [status, setStatus] = useState<Status>("loading");
  const [wallet, setWallet] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ user: { wallet: string } | null }>("/api/auth/session")
      .then(({ user }) => {
        if (cancelled) return;
        setWallet(user?.wallet ?? null);
        setStatus(user ? "signed-in" : "signed-out");
      })
      .catch(() => !cancelled && setStatus("signed-out"));
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setError("This wallet can't sign messages. Try a different wallet.");
      return false;
    }
    setSigningIn(true);
    setError(null);
    try {
      const address = publicKey.toBase58();
      const payload = await api<SignInPayload>("/api/auth/nonce", { body: { wallet: address } });
      const message = buildSignInMessage(payload);
      const signature = await signMessage(new TextEncoder().encode(message));
      await api("/api/auth/verify", {
        body: { wallet: address, nonce: payload.nonce, signature: bs58.encode(signature) },
      });
      setWallet(address);
      setStatus("signed-in");
      return true;
    } catch (e) {
      const rejected = e instanceof Error && /reject|denied|cancel/i.test(e.message);
      setError(rejected ? "You declined the sign-in request in your wallet." : errorMessage(e));
      return false;
    } finally {
      setSigningIn(false);
    }
  }, [publicKey, signMessage]);

  const signOut = useCallback(async () => {
    await api("/api/auth/session", { method: "DELETE" }).catch(() => null);
    setWallet(null);
    setStatus("signed-out");
    await disconnect().catch(() => null);
  }, [disconnect]);

  const connected = publicKey?.toBase58() ?? null;
  const mismatch = status === "signed-in" && connected !== null && connected !== wallet;

  const value = useMemo(
    () => ({ status, wallet, mismatch, signingIn, signIn, signOut, error }),
    [status, wallet, mismatch, signingIn, signIn, signOut, error],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
