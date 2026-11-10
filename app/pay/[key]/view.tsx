"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/wordmark";
import { NetworkBadge } from "@/components/network-badge";
import { api, errorMessage } from "@/lib/api-client";
import { formatMoney, toMinor } from "@/lib/paypal/types";
import { PaymentOutcome } from "@/features/paypal/payment-outcome";
import { loadSdk, newRequestKey, type PaypalButtons } from "@/features/paypal/sdk";

interface Checkout {
  accepting: boolean;
  workflowName: string;
  itemName: string;
  description: string;
  amount: string;
  currency: string;
  clientId: string | null;
  environment: "sandbox" | "live";
}

interface CaptureResult {
  status: string;
  captureStatus: string | null;
  captureId: string | null;
  runId: string | null;
}


export function View() {
  const { key } = useParams<{ key: string }>();
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [processing, setProcessing] = useState(false);
  // The buyer backed out on PayPal, or PayPal refused the payment. Both end on a clear screen
  // with a way to try again, instead of a line of red text under the buttons.
  const [stopped, setStopped] = useState<"cancelled" | "declined" | null>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Checkout>(`/api/pay/${key}`)
      .then(setCheckout)
      .catch((e) => setError(errorMessage(e)));
  }, [key]);

  useEffect(() => {
    if (!checkout?.accepting || !checkout.clientId || result || stopped || !buttonsRef.current) return;
    let buttons: PaypalButtons | null = null;
    let cancelled = false;
    loadSdk(checkout.clientId, checkout.currency)
      .then((paypal) => {
        if (cancelled || !buttonsRef.current) return;
        buttons = paypal.Buttons({
          style: { layout: "vertical", shape: "rect", label: "pay", height: 45 },
          createOrder: async () => {
            setError(null);
            const order = await api<{ id: string }>(`/api/pay/${key}/orders`, { body: { requestKey: newRequestKey() } });
            return order.id;
          },
          onApprove: async ({ orderID }) => {
            setProcessing(true);
            try {
              setResult(await api<CaptureResult>(`/api/pay/${key}/orders/${orderID}/capture`, { method: "POST", body: {} }));
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setProcessing(false);
            }
          },
          onCancel: () => {
            setError(null);
            setStopped("cancelled");
          },
          onError: () => {
            setError(null);
            setStopped("declined");
          },
        });
        buttonsRef.current.innerHTML = "";
        return buttons.render(buttonsRef.current);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load PayPal."));
    return () => {
      cancelled = true;
      buttons?.close?.().catch(() => null);
    };
  }, [checkout, key, result, stopped]);

  const price = checkout ? formatMoney(toMinor(checkout.amount), checkout.currency) : "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-[440px]">
        <div className="mb-5 flex items-center justify-between">
          <span className="flex items-center gap-2 font-display text-base font-semibold">
            <LogoMark className="h-6 w-6" /> Money Lego checkout
          </span>
          <NetworkBadge />
        </div>
        <section className="rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_48px_-32px_rgb(9_9_11/0.35)]">
          {!checkout && !error && <div className="h-40 animate-pulse rounded-xl bg-sunken" aria-label="Loading checkout" />}
          {checkout && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{checkout.workflowName}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{checkout.itemName}</h1>
              {checkout.description && <p className="mt-2 text-sm text-ink-2">{checkout.description}</p>}
              <p className="num mt-5 text-3xl font-bold text-ink">{price}</p>

              {result ? (
                <div className="mt-7 rounded-xl bg-paper px-5 py-6 shadow-[0_0_0_1px_var(--line)]">
                  {result.captureStatus === "COMPLETED" ? (
                    <PaymentOutcome outcome="paid">Thank you. PayPal confirmed your payment of {price}, and the seller&apos;s workflow has started.</PaymentOutcome>
                  ) : String(result.captureStatus ?? result.status).toUpperCase() === "DECLINED" ? (
                    <PaymentOutcome outcome="declined">PayPal declined this payment. Nothing was charged. Try another card or PayPal account.</PaymentOutcome>
                  ) : (
                    <PaymentOutcome outcome="pending">PayPal is still finishing this payment ({String(result.captureStatus ?? result.status).toLowerCase()}). The seller&apos;s workflow starts once it completes.</PaymentOutcome>
                  )}
                  {result.captureId && <p className="mt-4 text-center font-mono text-xs text-ink-3">PayPal capture {result.captureId}</p>}
                  {String(result.captureStatus ?? result.status).toUpperCase() === "DECLINED" && (
                    <div className="mt-4 flex justify-center">
                      <button type="button" onClick={() => setResult(null)} className="press rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-[#27272a]">
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              ) : stopped ? (
                <div className="mt-7 rounded-xl bg-paper px-5 py-6 shadow-[0_0_0_1px_var(--line)]">
                  {stopped === "cancelled" ? (
                    <PaymentOutcome outcome="cancelled">You closed PayPal before paying. Nothing was charged.</PaymentOutcome>
                  ) : (
                    <PaymentOutcome outcome="declined">PayPal couldn&apos;t complete the payment. Nothing was charged. Try again, or use another card or account.</PaymentOutcome>
                  )}
                  <div className="mt-5 flex justify-center">
                    <button type="button" onClick={() => setStopped(null)} className="press rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-[#27272a]">
                      Try again
                    </button>
                  </div>
                </div>
              ) : checkout.accepting ? (
                <div className="mt-6">
                  <div ref={buttonsRef} aria-busy={processing} className={processing ? "pointer-events-none opacity-50" : ""} />
                  {processing && <p className="mt-2 text-center text-sm text-ink-2">Confirming with PayPal…</p>}
                </div>
              ) : (
                <p className="mt-6 rounded-lg bg-sunken p-4 text-sm text-ink-2">This checkout isn&apos;t accepting payments right now. The seller needs to turn its workflow on.</p>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          )}
        </section>
        <p className="mt-4 text-center text-xs text-ink-3">
          {checkout?.environment === "live" ? "Payments are processed by PayPal." : "PayPal Sandbox: use a sandbox personal account. No real money moves."} The price is set by the seller, never by this page.
        </p>
      </div>
    </main>
  );
}
