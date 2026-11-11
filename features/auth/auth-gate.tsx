"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { AccountControl } from "./account-control";

// Everything behind the gate belongs to the signed-in account.
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [localSignedIn, setLocalSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        if (active) setLocalSignedIn(result.user?.kind === "local");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!isLoaded) return <div className="h-40 animate-pulse rounded-xl bg-sunken" aria-label="Loading your account" />;
  if (isSignedIn || localSignedIn) return <>{children}</>;

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
