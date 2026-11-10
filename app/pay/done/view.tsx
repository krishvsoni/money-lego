"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { LogoMark } from "@/components/wordmark";
import { NetworkBadge } from "@/components/network-badge";
import { BackButton } from "@/features/paypal/back-button";
import { PaymentOutcome } from "@/features/paypal/payment-outcome";

// Where PayPal sends a buyer after they approve (or cancel) a checkout link a workflow made.
// The workflow captures the payment itself; this page only tells the buyer what happens next.
export function View() {
  const params = useSearchParams();
  const cancelled = params.get("status") === "cancelled";
  // New checkout links name their workflow and run. For older links, PayPal's order id
  // (`token`) is looked up for the signed-in owner; only if that fails too does the button
  // fall back to the workflows list.
  const id = (v: string | null) => (v && /^[0-9a-f]{24}$/.test(v) ? v : null);
  const token = params.get("token");
  const named = { workflowId: id(params.get("w")), runId: id(params.get("run")) };
  const [found, setFound] = useState<{ workflowId: string | null; runId: string | null } | null>(null);
  useEffect(() => {
    if (named.workflowId || !token) return;
    let cancelled = false;
    api<{ workflowId: string | null; runId: string | null }>(`/api/checkout-return?token=${encodeURIComponent(token)}`)
      .then((r) => !cancelled && setFound({ workflowId: id(r.workflowId), runId: id(r.runId) }))
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [named.workflowId, token]);
  const { workflowId, runId } = named.workflowId ? named : (found ?? { workflowId: null, runId: null });
  const back = workflowId ? `/workflows/${workflowId}${runId ? `?run=${runId}` : ""}` : "/workflows";
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-[440px]">
        <div className="mb-5 flex items-center justify-between">
          <span className="flex items-center gap-2 font-display text-base font-semibold">
            <LogoMark className="h-6 w-6" /> Money Lego checkout
          </span>
          <NetworkBadge />
        </div>
        <section className="rounded-2xl border border-line bg-surface px-6 py-8 shadow-[0_24px_48px_-32px_rgb(9_9_11/0.35)]">
          <h1 className="sr-only">{cancelled ? "Checkout cancelled" : "Payment approved"}</h1>
          {cancelled ? (
            <PaymentOutcome outcome="cancelled" title="Checkout cancelled">
              You cancelled the payment on PayPal. Nothing was charged. If that was a mistake, ask the seller for a new link.
            </PaymentOutcome>
          ) : (
            <PaymentOutcome outcome="paid" title="Thanks, you're all set">
              You approved the payment on PayPal. The seller&apos;s workflow completes it in a moment, and you&apos;ll get PayPal&apos;s receipt by email.
            </PaymentOutcome>
          )}
          <div className="pay-copy mt-6 flex justify-center">
            <BackButton href={back}>{workflowId ? "Back to the workflow" : "Back to workflows"}</BackButton>
          </div>
          <p className="mt-6 text-center text-xs text-ink-3">PayPal Sandbox: test accounts and test money only.</p>
        </section>
      </div>
    </main>
  );
}
