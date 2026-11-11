"use client";

import type { ReactNode } from "react";
import { AccountControl } from "./account-control";
import { useAuthSession } from "./session-context";

// Everything behind the gate belongs to the signed-in account. The gate only decides what to
// show; every API call is still authorized on the server.
export function AuthGate({ children }: { children: ReactNode }) {
  const { loaded, user } = useAuthSession();

  if (!loaded) return <div className="h-40 animate-pulse rounded-xl bg-sunken" aria-label="Loading your account" />;
  if (user) return <>{children}</>;

  return (
    <section className="reveal mx-auto max-w-[520px] py-16">
      <h1 className="headline text-3xl">Sign in to Money Lego</h1>
      <p className="mt-3 text-ink-2">
        Your workflows, runs and approvals belong to your account. Everything runs against the PayPal Sandbox: test accounts and test money.
      </p>
      <div className="mt-6">
        <AccountControl />
      </div>
    </section>
  );
}
