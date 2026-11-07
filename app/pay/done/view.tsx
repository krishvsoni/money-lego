"use client";

import { useSearchParams } from "next/navigation";
import { LogoMark } from "@/components/wordmark";
import { NetworkBadge } from "@/components/network-badge";

// Where PayPal sends a buyer after they approve (or cancel) a checkout link a workflow made.
// The workflow captures the payment itself; this page only tells the buyer what happens next.
export function View() {
  const cancelled = useSearchParams().get("status") === "cancelled";
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-[440px]">
        <div className="mb-5 flex items-center justify-between">
          <span className="flex items-center gap-2 font-display text-base font-semibold">
            <LogoMark className="h-6 w-6" /> Money Lego checkout
          </span>
          <NetworkBadge />
        </div>
        <section className={`rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_48px_-32px_rgb(9_9_11/0.35)]`}>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{cancelled ? "Checkout cancelled" : "Thanks, you're all set"}</h1>
          <p className="mt-2 text-sm text-ink-2">
            {cancelled
              ? "You cancelled the payment on PayPal. Nothing was charged. If that was a mistake, ask the seller for a new link."
              : "You approved the payment on PayPal. The seller's workflow completes it in a moment, and you'll get PayPal's receipt by email."}
          </p>
          <p className="mt-4 text-xs text-ink-3">PayPal Sandbox: test accounts and test money only.</p>
        </section>
      </div>
    </main>
  );
}
