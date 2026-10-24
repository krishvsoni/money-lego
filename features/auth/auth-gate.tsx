"use client";

import type { ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { AccountControl } from "./account-control";
import { useSession } from "./session-context";

// Everything behind the gate is owned by a verified wallet. A connected wallet alone isn't
// enough; the person signs a free message so the server knows the address is theirs.
export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const { connected } = useWallet();

  if (session.status === "loading") {
    return <div className="h-40 animate-pulse rounded-xl bg-sunken" aria-label="Loading your account" />;
  }
  if (session.status === "signed-in" && !session.mismatch) return <>{children}</>;

  return (
    <section className="reveal mx-auto max-w-[520px] py-16">
      <h1 className="headline text-3xl">{session.mismatch ? "Your wallet changed" : "Sign in with your wallet"}</h1>
      <p className="mt-3 text-ink-2">
        {session.mismatch
          ? "Your wallet is now on a different account than the one you signed in with. Sign in as this account, or switch back in your wallet."
          : "Your recipes and runs belong to the wallet you sign in with. Signing in is a free message signature. It doesn't move funds or cost a fee."}
      </p>
      <ol className="mt-6 flex flex-col gap-2 text-sm">
        <li className={connected ? "text-ink-3 line-through" : "font-semibold"}>1. Connect a Solana wallet</li>
        <li className={connected ? "font-semibold" : "text-ink-3"}>2. Sign the sign-in message</li>
      </ol>
      <div className="mt-6">
        <AccountControl compact />
      </div>
      {session.error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {session.error}
        </p>
      )}
    </section>
  );
}
