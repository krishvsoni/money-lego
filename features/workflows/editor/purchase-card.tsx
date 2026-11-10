"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Clock, Package, Star, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";
import { formatMoney, toMinor } from "@/lib/paypal/types";
import type { RunDTO } from "@/lib/workflow/dto";

// What a sourcing run actually bought, at a glance: the product (photo, brand, store, price,
// rating) and how the money went, step by step: your approval, the PayPal checkout, the
// buyer's payment. Everything comes from the run's own record; the product is then refreshed
// from Channel3 by id for its photo, stock and rating. If Channel3 can't be reached, the
// stored copy is shown.

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

interface Product {
  id: string;
  title: string;
  brand: string | null;
  image: string | null;
  price: string | null;
  currency: string | null;
  availability: string | null;
  merchant: string | null;
  buyUrl: string | null;
  rating: number | null;
  features: string[];
}

function money(amount: string | null, currency: string | null): string | null {
  if (!amount || !currency) return amount;
  try {
    return formatMoney(toMinor(amount), currency);
  } catch {
    return `${amount} ${currency}`;
  }
}

// The last word on each piece wins: outputs carry their input forward, so later steps hold
// the fullest copy.
function readRun(run: RunDTO) {
  let pick: Obj | null = null;
  let reason: string | null = null;
  let checkout: Obj | null = null;
  let purchase: Obj | null = null;
  const nodes = [...(run.nodes ?? [])].sort((a, b) => new Date(a.finishedAt ?? a.startedAt ?? 0).getTime() - new Date(b.finishedAt ?? b.startedAt ?? 0).getTime());
  for (const n of nodes) {
    const out = obj(n.output);
    if (out.pick) pick = obj(out.pick);
    if (str(out.pickReason)) reason = str(out.pickReason);
    if (out.checkout) checkout = obj(out.checkout);
    if (out.purchase) purchase = obj(out.purchase);
  }
  const approvalNode = nodes.find((n) => n.nodeType === "logic.approval" && n.waitState);
  const wait = obj(approvalNode?.waitState);
  const approval = approvalNode
    ? { decision: str(wait.decision), by: str(wait.by), at: str(wait.at), waiting: approvalNode.status === "waiting" }
    : null;
  return { pick, reason, checkout, purchase, approval };
}

type Tone = "done" | "wait" | "fail" | "off";
const DOT: Record<Tone, string> = { done: "bg-success text-paper", wait: "bg-attention-wash text-attention", fail: "bg-danger text-paper", off: "bg-sunken text-ink-3" };

function Step({ tone, title, detail, mono }: { tone: Tone; title: string; detail: string | null; mono?: string | null }) {
  const Icon = tone === "done" ? Check : tone === "fail" ? X : Clock;
  return (
    <li className="flex min-w-0 items-start gap-2 px-3 py-2.5">
      <span className={`mt-px flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full ${DOT[tone]}`} aria-hidden>
        <Icon className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
      <span className="min-w-0">
        <span className={`block font-semibold ${tone === "off" ? "text-ink-3" : "text-ink"}`}>{title}</span>
        {detail && <span className="block truncate text-ink-2">{detail}</span>}
        {mono && (
          <span className="block truncate font-mono text-[0.6875rem] text-ink-3" title={mono}>
            {mono}
          </span>
        )}
      </span>
    </li>
  );
}

export function PurchaseCard({ run }: { run: RunDTO }) {
  const { pick, reason, checkout, purchase, approval } = readRun(run);
  const productId = str(pick?.id);
  const [live, setLive] = useState<{ id: string; product: Product } | null>(null);
  const [imageFailed, setImageFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    api<{ product: Product }>(`/api/products/${encodeURIComponent(productId)}`)
      .then((r) => !cancelled && setLive({ id: productId, product: r.product }))
      .catch(() => null); // the stored copy is shown instead
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (!pick && !checkout && !purchase) return null;

  const fresh = live?.id === productId ? live.product : null;
  const title = fresh?.title ?? str(pick?.title) ?? str(checkout?.product) ?? "Product";
  const brand = fresh?.brand ?? str(pick?.brand);
  const merchant = str(pick?.merchant) ?? fresh?.merchant ?? null;
  const image = fresh?.image ?? str(pick?.image);
  const buyUrl = str(pick?.buyUrl) ?? fresh?.buyUrl ?? null;
  // The price that was approved and charged, not today's price.
  const price = money(str(purchase?.amount) ?? str(checkout?.price) ?? str(pick?.price), str(purchase?.currency) ?? str(checkout?.currency) ?? str(pick?.currency));
  const nowPrice = fresh?.price && fresh.price !== (str(checkout?.price) ?? str(pick?.price)) ? money(fresh.price, fresh.currency) : null;

  const paid = str(purchase?.status) === "COMPLETED";
  const failed = Boolean(purchase && (purchase.failure || (!paid && str(purchase?.status))));
  const status = paid ? { label: "Paid", tone: "bg-success-wash text-success" } : failed ? { label: "Not paid", tone: "bg-danger-wash text-danger" } : checkout ? { label: "Awaiting payment", tone: "bg-attention-wash text-attention" } : approval?.waiting ? { label: "Needs approval", tone: "bg-attention-wash text-attention" } : { label: "Picked", tone: "bg-sunken text-ink-2" };

  const approvalTone: Tone = !approval ? "off" : approval.decision === "approved" ? "done" : approval.decision === "rejected" ? "fail" : "wait";
  const checkoutTone: Tone = checkout ? (str(checkout.orderId) ? "done" : "wait") : "off";
  const payTone: Tone = paid ? "done" : failed ? "fail" : checkout ? "wait" : "off";

  return (
    <section aria-label="Purchase" className="reveal mb-3 overflow-hidden rounded-xl border border-line bg-paper text-xs">
      <div className="flex gap-3.5 p-3.5">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-[0_0_0_1px_var(--line)]">
          {image && imageFailed !== image ? (
            // eslint-disable-next-line @next/next/no-img-element -- merchant CDNs vary per product; next/image would need every host listed
            <img src={image} alt={title} referrerPolicy="no-referrer" loading="lazy" onError={() => setImageFailed(image)} className="h-full w-full object-contain p-1.5" />
          ) : (
            <Package className="h-7 w-7 text-ink-3" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-[0.6875rem] font-semibold text-ink-3">{[brand, merchant].filter(Boolean).join(" · ") || "Channel3 product"}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold ${status.tone}`}>{status.label}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-ink">{title}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {price && <span className="num text-base font-bold text-ink">{price}</span>}
            {fresh?.rating ? (
              <span className="inline-flex items-center gap-0.5 font-semibold text-ink-2">
                <Star className="h-3 w-3 fill-[var(--brick-2)] text-[var(--brick-2)]" aria-hidden />
                {fresh.rating.toFixed(1)}
              </span>
            ) : null}
            {fresh?.availability && <span className={fresh.availability === "InStock" ? "text-success" : "text-attention"}>{fresh.availability === "InStock" ? "In stock now" : "Out of stock now"}</span>}
            {nowPrice && <span className="text-ink-3">now {nowPrice}</span>}
          </p>
          {reason && <p className="mt-1.5 line-clamp-2 leading-relaxed text-ink-2">Why this one: {reason}</p>}
        </div>
      </div>

      {fresh && fresh.features.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 px-3.5 pb-3" aria-label="Key features">
          {fresh.features.slice(0, 3).map((f) => (
            <li key={f} className="max-w-full truncate rounded-full bg-sunken px-2 py-0.5 text-ink-2">
              {f}
            </li>
          ))}
        </ul>
      )}

      <ol className="grid border-t border-line sm:grid-cols-3 sm:divide-x sm:divide-line" aria-label="How the money moved">
        <Step
          tone={approvalTone}
          title={approval?.decision === "approved" ? "You approved" : approval?.decision === "rejected" ? "You rejected" : approval ? "Waiting for you" : "Approval"}
          detail={approval?.at ? `${approval.by ? `${approval.by}, ` : ""}${relativeTime(approval.at)}` : null}
        />
        <Step tone={checkoutTone} title={checkout ? "Checkout created" : "Checkout"} detail={checkout ? money(str(checkout.price), str(checkout.currency)) : null} mono={str(checkout?.orderId) ? `Order ${str(checkout?.orderId)}` : null} />
        <Step
          tone={payTone}
          title={paid ? "Buyer paid" : failed ? "Payment didn't complete" : checkout ? "Waiting for buyer" : "Payment"}
          detail={paid ? money(str(purchase?.amount), str(purchase?.currency)) : failed ? str(purchase?.failure) : null}
          mono={str(purchase?.captureId) ? `Capture ${str(purchase?.captureId)}` : null}
        />
      </ol>

      {(buyUrl || (checkout && !paid && str(checkout.approveUrl))) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface px-3.5 py-2">
          {buyUrl && (
            <a href={buyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-ink underline-offset-2 hover:underline">
              View on {merchant ?? "the store"} <ArrowUpRight className="h-3 w-3" aria-hidden />
            </a>
          )}
          {checkout && !paid && str(checkout.approveUrl) && (
            <a href={str(checkout.approveUrl)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-ink underline-offset-2 hover:underline">
              Open the PayPal checkout <ArrowUpRight className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>
      )}
    </section>
  );
}
