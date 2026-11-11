"use client";

import type { ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/auth-provider";
import { AccountControl } from "./account-control";
import { useLocalSession } from "./use-local-session";

// Everything behind the gate belongs to the signed-in account. Clerk's hooks only run when
// Clerk is this deployment's sign-in system (they throw outside <ClerkProvider>).
export function AuthGate({ children }: { children: ReactNode }) {
  return clerkEnabled ? <ClerkGate>{children}</ClerkGate> : <LocalGate>{children}</LocalGate>;
}

function ClerkGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const local = useLocalSession();
  if (!isLoaded || (!isSignedIn && !local.loaded)) return <Loading />;
  return isSignedIn || local.name ? <>{children}</> : <SignInPrompt />;
}

function LocalGate({ children }: { children: ReactNode }) {
  const local = useLocalSession();
  if (!local.loaded) return <Loading />;
  return local.name ? <>{children}</> : <SignInPrompt />;
}

const Loading = () => <div className="h-40 animate-pulse rounded-xl bg-sunken" aria-label="Loading your account" />;

function SignInPrompt() {
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
