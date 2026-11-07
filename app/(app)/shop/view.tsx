"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { loadSdk, newRequestKey, type PaypalButtons } from "@/features/paypal/sdk";
import { api, errorMessage } from "@/lib/api-client";
import { formatMoney, toMinor } from "@/lib/paypal/types";
import { useResource } from "@/lib/use-resource";
import type { AssistantResult } from "@/server/commerce/service";

type Product = AssistantResult["products"][number];
interface Config {
  paypalClientId: string | null;
  channel3Ready: boolean;
}

const money = (value: string | null, currency: string | null) => {
  if (!value) return "—";
  try {
    return formatMoney(toMinor(value), currency);
  } catch {
    return `${value} ${currency ?? ""}`;
  }
};

// Checkout for one product: PayPal Buttons create the order on the server (at Channel3's
// current price) and the buyer approves it in PayPal's window.
function Checkout({ product, clientId, onDone }: { product: Product; clientId: string; onDone: (msg: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let buttons: PaypalButtons | null = null;
    let cancelled = false;
    loadSdk(clientId, product.currency ?? "USD")
      .then((paypal) => {
        if (cancelled || !ref.current) return;
        buttons = paypal.Buttons({
          style: { layout: "horizontal", label: "buynow", height: 40, tagline: false },
          createOrder: async () => (await api<{ id: string }>("/api/shop/orders", { body: { productId: product.id, requestKey: newRequestKey() } })).id,
          onApprove: async ({ orderID }) => {
            try {
              const r = await api<{ captureId: string | null; captureStatus: string | null }>(`/api/shop/orders/${orderID}/capture`, { method: "POST", body: {} });
              onDone(r.captureStatus === "COMPLETED" ? `Paid with PayPal. Capture ${r.captureId}.` : `PayPal reports ${r.captureStatus ?? "no capture"}.`);
            } catch (e) {
              setError(errorMessage(e));
            }
          },
          onCancel: () => setError("Checkout cancelled. Nothing was charged."),
          onError: () => setError("PayPal couldn't complete the payment. Nothing was charged."),
        });
        ref.current.innerHTML = "";
        return buttons.render(ref.current);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load PayPal."));
    return () => {
      cancelled = true;
      buttons?.close?.().catch(() => null);
    };
  }, [clientId, product, onDone]);
  return (
    <div className="mt-3">
      <div ref={ref} />
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function View() {
  const config = useResource<Config>("/api/config");
  const [request, setRequest] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    setBuying(null);
    try {
      setResult(await api<AssistantResult>("/api/shop/search", { body: { request, maxPrice: maxPrice ? Number(maxPrice) : null } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const clientId = config.data?.paypalClientId ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI shopping assistant"
        description="Describe what you need. Channel3 finds real products with live prices, AI compares only what Channel3 returned, and you approve the PayPal checkout yourself. PayPal Sandbox: no real money moves."
      />
      {config.data && !config.data.channel3Ready && <p className="rounded-md bg-attention-wash px-3 py-2 text-sm text-attention">Channel3 isn&apos;t configured on this server yet (CHANNEL3_API_KEY).</p>}

      <form onSubmit={search} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-xs font-semibold">
          Looking for
          <input className={inputClass} value={request} onChange={(e) => setRequest(e.target.value)} placeholder="A quiet mechanical keyboard for a small studio" minLength={3} maxLength={300} required />
        </label>
        <label className="flex w-full flex-col gap-1.5 text-xs font-semibold sm:w-36">
          Max price (USD)
          <input className={inputClass} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder="150" inputMode="decimal" />
        </label>
        <Button type="submit" busy={busy} className="gap-1.5">
          <Sparkles className="h-4 w-4" aria-hidden /> Find products
        </Button>
      </form>
      {error && <p className="rounded-md bg-danger-wash px-3 py-2 text-sm text-danger">{error}</p>}
      {done && <p className="rounded-md bg-success-wash px-3 py-2 text-sm text-success" role="status">{done} It now appears on the Payments page.</p>}

      {result && (
        <>
          <p className="flex items-start gap-2 text-sm text-ink-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brick-1)]" aria-hidden />
            <span>
              {result.summary} {result.aiRanked && <span className="text-ink-3">(AI ranking of Channel3 results; prices and availability come from Channel3.)</span>}
            </span>
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.products.map((p) => (
              <li key={p.id} className={`flex flex-col rounded-xl border bg-surface p-4 ${p.recommended ? "border-[var(--brick-1)]/50" : "border-line"}`}>
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-sunken">
                  {/* eslint-disable-next-line @next/next/no-img-element -- product images come from many merchant CDNs */}
                  {p.image ? <img src={p.image} alt={p.title} className="h-full w-full object-contain" loading="lazy" referrerPolicy="no-referrer" /> : <span className="text-xs text-ink-3">No image</span>}
                </div>
                {p.recommended && <span className="mt-3 w-fit rounded-full bg-[color-mix(in_srgb,var(--brick-1)_12%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--brick-1)]">AI pick</span>}
                <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-ink">{p.title}</h3>
                <p className="mt-0.5 text-xs text-ink-3">
                  {[p.brand, p.merchant, p.rating ? `★ ${p.rating.toFixed(1)}` : null].filter(Boolean).join(" · ")}
                </p>
                {p.reason && <p className="mt-2 text-xs text-ink-2">{p.reason}</p>}
                <div className="mt-auto pt-3">
                  <p className="num text-lg font-bold text-ink">{money(p.price, p.currency)}</p>
                  {buying === p.id && clientId ? (
                    <Checkout product={p} clientId={clientId} onDone={setDone} />
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <Button className="h-9 flex-1" disabled={!clientId} onClick={() => setBuying(p.id)}>
                        {clientId ? "Buy with PayPal" : "PayPal not configured"}
                      </Button>
                      {p.buyUrl && (
                        <a href={p.buyUrl} target="_blank" rel="noreferrer" className="press inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold text-ink-2 hover:bg-sunken">
                          Details
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-xs text-ink-3">Product data by Channel3. Checkout by PayPal (sandbox). The price is re-read from Channel3 on the server when the order is created.</p>
    </div>
  );
}
