"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatMoney } from "@/lib/paypal/types";
import type { PaymentsOverview } from "@/server/paypal/status";

// The four numbers that answer "where is the money", in one row, each able to show its
// working: every PayPal object that adds up to it, with the workflow and run it came from.
// Built straight from the ledger, so every figure can be traced to a PayPal id.

type Resource = PaymentsOverview["resources"][number];
type MetricId = "captured" | "paid_out" | "refunded" | "net";

const CAPTURED = ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"];

const METRICS: Record<Exclude<MetricId, "net">, { label: string; rule: string; match: (r: Resource) => boolean; noun: [string, string] }> = {
  captured: {
    label: "Captured",
    rule: "Money buyers paid you: every PayPal capture that completed (including ones later refunded, which show under Refunded).",
    match: (r) => r.kind === "capture" && CAPTURED.includes(r.status),
    noun: ["capture", "captures"],
  },
  paid_out: {
    label: "Paid out",
    rule: "Money you sent to other people with PayPal Payouts: every payout item PayPal marked SUCCESS. Batches still processing aren't counted until they land.",
    match: (r) => r.kind === "payout_item" && r.status === "SUCCESS",
    noun: ["payout", "payouts"],
  },
  refunded: {
    label: "Refunded",
    rule: "Money returned to buyers: every PayPal refund that completed.",
    match: (r) => r.kind === "refund" && r.status === "COMPLETED",
    noun: ["refund", "refunds"],
  },
};

function sum(rows: Resource[]): Record<string, bigint> {
  const out: Record<string, bigint> = {};
  for (const r of rows) {
    if (!r.currency || !r.amountMinor || !/^-?\d+$/.test(r.amountMinor)) continue;
    out[r.currency] = (out[r.currency] ?? 0n) + BigInt(r.amountMinor);
  }
  return out;
}

function show(totals: Record<string, bigint>): string {
  const entries = Object.entries(totals).filter(([, v]) => v !== 0n);
  if (!entries.length) return formatMoney(0n, "USD");
  return entries.map(([c, v]) => (v < 0n ? `−${formatMoney(-v, c)}` : formatMoney(v, c))).join(" + ");
}

export function MoneySummary({ data }: { data: PaymentsOverview }) {
  const [open, setOpen] = useState<MetricId | null>(null);
  const rows = {
    captured: data.resources.filter(METRICS.captured.match),
    paid_out: data.resources.filter(METRICS.paid_out.match),
    refunded: data.resources.filter(METRICS.refunded.match),
  };
  const totals = { captured: sum(rows.captured), paid_out: sum(rows.paid_out), refunded: sum(rows.refunded) };
  const currencies = new Set([...Object.keys(totals.captured), ...Object.keys(totals.paid_out), ...Object.keys(totals.refunded)]);
  const net: Record<string, bigint> = {};
  for (const c of currencies) net[c] = (totals.captured[c] ?? 0n) - (totals.paid_out[c] ?? 0n) - (totals.refunded[c] ?? 0n);

  const tiles: Array<{ id: MetricId; label: string; value: string; sub: string; tone?: string }> = [
    { id: "captured", label: "Captured", value: show(totals.captured), sub: `${rows.captured.length} ${METRICS.captured.noun[rows.captured.length === 1 ? 0 : 1]}` },
    { id: "paid_out", label: "Paid out", value: show(totals.paid_out), sub: `${rows.paid_out.length} ${METRICS.paid_out.noun[rows.paid_out.length === 1 ? 0 : 1]}` },
    { id: "refunded", label: "Refunded", value: show(totals.refunded), sub: `${rows.refunded.length} ${METRICS.refunded.noun[rows.refunded.length === 1 ? 0 : 1]}` },
    {
      id: "net",
      label: "Net kept",
      value: show(net),
      sub: "Captured − paid out − refunded",
      tone: Object.values(net).some((v) => v < 0n) ? "text-danger" : "text-ink",
    },
  ];

  return (
    <section aria-label="Money summary" className="overflow-hidden rounded-xl border border-line bg-paper">
      <div className="grid grid-cols-2 divide-line max-sm:[&>*:nth-child(-n+2)]:border-b max-sm:[&>*:nth-child(odd)]:border-r sm:grid-cols-4 sm:divide-x">
        {tiles.map((t) => {
          const active = open === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setOpen(active ? null : t.id)}
              aria-expanded={active}
              aria-controls="money-working"
              className={`group flex min-w-0 flex-col items-start gap-0.5 border-line px-4 py-3.5 text-left transition-colors duration-150 ${active ? "bg-surface" : "hover:bg-surface"}`}
            >
              <span className="text-xs font-semibold text-ink-2">{t.label}</span>
              <span className={`num truncate text-2xl font-bold tracking-tight ${t.tone ?? "text-ink"}`}>{t.value}</span>
              <span className="flex w-full items-center justify-between gap-2 text-xs text-ink-3">
                <span className="truncate">{t.sub}</span>
                <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-ink-2 opacity-70 group-hover:opacity-100">
                  How
                  <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${active ? "rotate-180" : ""}`} aria-hidden />
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {open && (
        <div id="money-working" className="reveal border-t border-line bg-surface px-4 py-3.5 text-xs">
          {open === "net" ? (
            <div className="flex flex-col gap-2">
              <p className="leading-relaxed text-ink-2">What stayed with you after paying people and refunding buyers. PayPal&apos;s own fees aren&apos;t taken off here; each capture&apos;s fee is on its run.</p>
              <table className="w-full max-w-md">
                <tbody className="num">
                  <tr>
                    <td className="py-0.5 text-ink-2">Captured</td>
                    <td className="py-0.5 text-right font-semibold text-ink">{show(totals.captured)}</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 text-ink-2">− Paid out</td>
                    <td className="py-0.5 text-right font-semibold text-ink">{show(totals.paid_out)}</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 text-ink-2">− Refunded</td>
                    <td className="py-0.5 text-right font-semibold text-ink">{show(totals.refunded)}</td>
                  </tr>
                  <tr className="border-t border-line-strong">
                    <td className="pt-1.5 font-bold text-ink">Net kept</td>
                    <td className="pt-1.5 text-right font-bold text-ink">{show(net)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <p className="leading-relaxed text-ink-2">{METRICS[open].rule}</p>
              {rows[open].length === 0 ? (
                <p className="text-ink-3">Nothing yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left">
                    <thead className="text-[0.6875rem] text-ink-3">
                      <tr>
                        <th className="py-1 pr-3 font-semibold">PayPal id</th>
                        <th className="py-1 pr-3 font-semibold">Workflow</th>
                        <th className="py-1 pr-3 font-semibold">{open === "paid_out" ? "Paid to" : "Status"}</th>
                        <th className="py-1 pr-3 font-semibold">When</th>
                        <th className="py-1 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows[open].map((r) => (
                        <tr key={r.id} className="border-t border-line">
                          <td className="py-1.5 pr-3 font-mono text-ink">{r.paypalId}</td>
                          <td className="max-w-[220px] truncate py-1.5 pr-3 text-ink-2">
                            {r.workflowId && r.runId ? (
                              <Link href={`/workflows/${r.workflowId}?run=${r.runId}`} className="underline-offset-2 hover:text-ink hover:underline">
                                {r.workflowName}
                              </Link>
                            ) : (
                              (r.workflowName ?? "Direct")
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-ink-2">{open === "paid_out" ? (r.counterparty ?? "—") : r.status.toLowerCase().replace(/_/g, " ")}</td>
                          <td className="py-1.5 pr-3 text-ink-3">{new Date(r.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
                          <td className="num py-1.5 text-right font-semibold text-ink">{r.amountMinor && r.currency ? formatMoney(BigInt(r.amountMinor), r.currency) : "—"}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-line-strong">
                        <td colSpan={4} className="pt-1.5 font-bold text-ink">
                          Total
                        </td>
                        <td className="num pt-1.5 text-right font-bold text-ink">{show(totals[open])}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
