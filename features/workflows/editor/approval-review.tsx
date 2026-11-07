"use client";

import { formatMoney, toMinor } from "@/lib/paypal/types";
import type { RunDTO } from "@/lib/workflow/dto";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);

function money(value: unknown, currency: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  try {
    return formatMoney(toMinor(value), String(currency ?? ""));
  } catch {
    return `${value} ${String(currency ?? "")}`;
  }
}

// Exactly what approving will do, read from the approval's persisted plan: every PayPal
// action on the Approved branch with its recipients, amounts, capture or invoices, plus the
// AI review and the fingerprint each action re-checks before it touches PayPal.
export function ApprovalReview({ run, nodeId }: { run: RunDTO; nodeId: string }) {
  const nodeRun = run.nodes?.find((n) => n.nodeId === nodeId);
  const actions = list(nodeRun?.waitState?.actions);
  const review = obj(obj(nodeRun?.input).review);
  const hash = nodeRun?.waitState?.payloadHash;
  const trigger = run.trigger.type.replace("trigger.", "").replace("_", " ");

  return (
    <details className="mt-2 w-full rounded-md bg-paper/70 text-xs" open>
      <summary className="cursor-pointer px-2.5 py-1.5 font-semibold text-ink">
        {actions.length ? `Approving runs ${actions.length} PayPal action${actions.length > 1 ? "s" : ""}` : "Approving continues the workflow (no PayPal money action on this branch)"}
      </summary>
      <div className="flex flex-col gap-3 px-2.5 pb-2.5">
        {review.risk ? (
          <div className={`rounded-md px-2.5 py-2 ${review.risk === "high" ? "bg-danger-wash text-danger" : review.risk === "medium" ? "bg-attention-wash text-attention" : "bg-success-wash text-success"}`}>
            <p className="font-bold">AI risk review: {String(review.risk)}</p>
            <p className="mt-0.5 text-ink-2">{String(review.summary ?? "")}</p>
            {list(review.checks).length > 0 && (
              <ul className="mt-1.5 grid gap-0.5 text-ink-2 sm:grid-cols-2">
                {list(review.checks).map((c, i) => (
                  <li key={i}>
                    <span className={c.ok ? "text-success" : "text-danger"}>{c.ok ? "✓" : "✗"}</span> {String(c.name)}: {String(c.detail)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {actions.map((a, i) => {
          const intent = obj(a.intent);
          return (
            <div key={i} className="rounded border border-line">
              <p className="border-b border-line px-2 py-1.5 font-semibold text-ink">{String(a.title)}</p>
              {intent.kind === "payout" && (
                <div className="px-2 py-1.5">
                  <p className="text-ink-2">
                    PayPal Payouts batch of <span className="font-semibold text-ink">{money(intent.total, intent.currency)}</span> to {list(intent.items).length} recipient(s), from the merchant&apos;s PayPal balance.
                  </p>
                  <ul className="mt-1.5 max-h-36 overflow-auto">
                    {list(intent.items).map((it, k) => (
                      <li key={k} className="flex items-center justify-between gap-2 border-t border-line py-1 first:border-0">
                        <span className="min-w-0 truncate">
                          {it.label ? <span className="mr-1 font-semibold text-ink">{String(it.label)}</span> : null}
                          <span className="font-mono text-ink-2">{String(it.receiver)}</span>
                        </span>
                        <span className="shrink-0 font-semibold text-ink">{money(it.amount, intent.currency)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {intent.kind === "checkout" && (
                <p className="px-2 py-1.5 text-ink-2">
                  Create a PayPal checkout for <span className="font-semibold text-ink">{String(intent.title)}</span>
                  {intent.merchant ? ` from ${String(intent.merchant)}` : ""} at <span className="font-semibold text-ink">{money(intent.price, intent.currency)}</span>. The buyer still approves the payment on PayPal, and if the price changes before then, nothing is created.
                </p>
              )}
              {intent.kind === "refund" && (
                <p className="px-2 py-1.5 text-ink-2">
                  Refund <span className="font-semibold text-ink">{intent.amount ? money(intent.amount, intent.currency) : "the full amount"}</span> of capture <span className="font-mono text-ink">{String(intent.captureId)}</span>.
                  {intent.note ? ` Note to buyer: “${String(intent.note)}”` : ""}
                </p>
              )}
              {(intent.kind === "invoice_send" || intent.kind === "invoice_remind") && (
                <div className="px-2 py-1.5">
                  <p className="text-ink-2">
                    {intent.kind === "invoice_send" ? "Send" : "Remind"} {list(intent.invoices).length} invoice(s) through PayPal. Subject: “{String(intent.subject)}”
                  </p>
                  <ul className="mt-1.5 max-h-44 overflow-auto">
                    {list(intent.invoices).map((inv, k) => (
                      <li key={k} className="border-t border-line py-1 first:border-0">
                        <span className="font-mono font-semibold text-ink">{String(inv.number ?? inv.invoiceId)}</span>
                        <span className="block whitespace-pre-wrap text-ink-2">{String(inv.note || "(default note)")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink-2">
          <dt>Started by</dt>
          <dd className="text-ink">
            {trigger} at {new Date(run.trigger.at).toLocaleString()}
          </dd>
          <dt>Environment</dt>
          <dd className="text-ink">PayPal Sandbox</dd>
          {typeof hash === "string" && (
            <>
              <dt>Fingerprint</dt>
              <dd className="font-mono text-ink" title="Each PayPal action recomputes this and refuses to run if anything changed after you approved.">
                {hash.slice(0, 16)}…
              </dd>
            </>
          )}
        </dl>
      </div>
    </details>
  );
}
