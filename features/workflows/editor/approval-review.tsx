"use client";

import type { ReactNode } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { formatMoney, toMinor } from "@/lib/paypal/types";
import { nodeDefinition } from "@/lib/nodes/registry";
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

const RISK: Record<string, { label: string; pill: string }> = {
  high: { label: "High risk", pill: "bg-danger-wash text-danger ring-danger/25" },
  medium: { label: "Medium risk", pill: "bg-attention-wash text-attention ring-attention/25" },
  low: { label: "Low risk", pill: "bg-success-wash text-success ring-success/25" },
};

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-3 py-2">
        <h4 className="text-xs font-bold text-ink">{title}</h4>
        {aside}
      </header>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  );
}

// Exactly what approving will do, read from the approval's persisted plan: every PayPal
// action on the Approved branch with its recipients, amounts, capture or invoices, plus the
// AI review and the fingerprint each action re-checks before it touches PayPal.
export function ApprovalReview({ run, nodeId }: { run: RunDTO; nodeId: string }) {
  const nodeRun = run.nodes?.find((n) => n.nodeId === nodeId);
  const actions = list(nodeRun?.waitState?.actions);
  const review = obj(obj(nodeRun?.input).review);
  const hash = nodeRun?.waitState?.payloadHash;
  // Failed checks first: they are what the approver has to weigh.
  const checks = list(review.checks).sort((a, b) => Number(Boolean(a.ok)) - Number(Boolean(b.ok)));
  const risk = RISK[String(review.risk)] ?? null;

  return (
    <div className="mt-3 flex flex-col gap-3 text-xs">
      {review.risk ? (
        <Section
          title="AI risk review"
          aside={risk && <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-bold ring-1 ring-inset ${risk.pill}`}>{risk.label}</span>}
        >
          {review.summary ? <p className="max-w-[80ch] leading-relaxed text-ink-2">{String(review.summary)}</p> : null}
          {checks.length > 0 && (
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {checks.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  {c.ok ? (
                    <CircleCheck className="mt-px h-3.5 w-3.5 shrink-0 text-success" aria-label="Passed" />
                  ) : (
                    <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-danger" aria-label="Flagged" />
                  )}
                  <span className="min-w-0 leading-relaxed text-ink-2">
                    <span className={`font-semibold ${c.ok ? "text-ink" : "text-danger"}`}>{String(c.name)}</span>: {String(c.detail)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      {actions.length === 0 && <p className="text-ink-2">Approving continues the workflow. No PayPal money moves on this branch.</p>}

      {actions.map((a, i) => {
        const intent = obj(a.intent);
        return (
          <Section key={i} title={String(a.title ?? "PayPal action")} aside={intent.kind === "payout" ? <span className="num font-bold text-ink">{money(intent.total, intent.currency)}</span> : undefined}>
            {intent.kind === "payout" && (
              <>
                <p className="text-ink-2">
                  Sent from the merchant&apos;s PayPal balance to {list(intent.items).length} recipient{list(intent.items).length === 1 ? "" : "s"}.
                </p>
                <ul className="mt-2 max-h-40 overflow-auto rounded-md border border-line">
                  {list(intent.items).map((it, k) => (
                    <li key={k} className="flex items-center justify-between gap-3 border-t border-line px-2.5 py-1.5 first:border-t-0">
                      <span className="min-w-0">
                        {it.label ? <span className="block font-semibold text-ink">{String(it.label)}</span> : null}
                        <span className="block truncate font-mono text-[0.6875rem] text-ink-3">{String(it.receiver)}</span>
                      </span>
                      <span className="num shrink-0 font-semibold text-ink">{money(it.amount, intent.currency)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {intent.kind === "checkout" && (
              <p className="leading-relaxed text-ink-2">
                Create a PayPal checkout for <span className="font-semibold text-ink">{String(intent.title)}</span>
                {intent.merchant ? ` from ${String(intent.merchant)}` : ""} at <span className="font-semibold text-ink">{money(intent.price, intent.currency)}</span>. The buyer still approves the payment on PayPal, and if the price changes before then, nothing is created.
              </p>
            )}
            {intent.kind === "refund" && (
              <p className="leading-relaxed text-ink-2">
                Refund <span className="font-semibold text-ink">{intent.amount ? money(intent.amount, intent.currency) : "the full amount"}</span> of capture <span className="font-mono text-ink">{String(intent.captureId)}</span>.
                {intent.note ? ` Note to buyer: “${String(intent.note)}”` : ""}
              </p>
            )}
            {(intent.kind === "invoice_send" || intent.kind === "invoice_remind") && (
              <>
                <p className="text-ink-2">
                  {intent.kind === "invoice_send" ? "Send" : "Remind"} {list(intent.invoices).length} invoice(s) through PayPal. Subject: “{String(intent.subject)}”
                </p>
                <ul className="mt-2 max-h-44 overflow-auto rounded-md border border-line">
                  {list(intent.invoices).map((inv, k) => (
                    <li key={k} className="border-t border-line px-2.5 py-1.5 first:border-t-0">
                      <span className="font-mono font-semibold text-ink">{String(inv.number ?? inv.invoiceId)}</span>
                      <span className="block whitespace-pre-wrap text-ink-2">{String(inv.note || "(default note)")}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>
        );
      })}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-0.5 text-ink-3">
        <dt>Started by</dt>
        <dd className="text-ink-2">
          {nodeDefinition(run.trigger.type)?.title ?? run.trigger.type} · {new Date(run.trigger.at).toLocaleString()}
        </dd>
        <dt>Environment</dt>
        <dd className="text-ink-2">PayPal Sandbox</dd>
        {typeof hash === "string" && (
          <>
            <dt>Fingerprint</dt>
            <dd className="font-mono text-ink-2" title="Each PayPal action recomputes this and refuses to run if anything changed after you approved.">
              {hash.slice(0, 16)}…
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
