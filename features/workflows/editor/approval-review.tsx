"use client";

import { Address } from "@/components/ui/address";
import { useSession } from "@/features/auth/session-context";
import { formatSol, formatToken } from "@/lib/format";
import type { RunDTO } from "@/lib/workflow/dto";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

// Everything the reviewer approves, read from the approval node's own persisted input: the
// payer, token, every recipient and amount, the quote, what started the run, and the
// fingerprint the transfer step re-checks. Approving means "exactly this".
export function ApprovalReview({ run, nodeId }: { run: RunDTO; nodeId: string }) {
  const { wallet } = useSession();
  const nodeRun = run.nodes?.find((n) => n.nodeId === nodeId);
  const input = obj(nodeRun?.input);
  const mint = typeof input.tokenMint === "string" ? input.tokenMint : null;
  const destinations = Array.isArray(input.destinations) ? (input.destinations as Obj[]) : [];
  const estimate = obj(input.estimate);
  const hash = nodeRun?.waitState?.payloadHash;
  if (!mint || !destinations.length) return null;

  return (
    <details className="mt-2 w-full rounded-md bg-paper/70 text-xs" open>
      <summary className="cursor-pointer px-2.5 py-1.5 font-semibold text-ink">
        Review {formatToken(String(input.amountRaw ?? "0"), mint)} to {destinations.length} recipient{destinations.length > 1 ? "s" : ""}
      </summary>
      <div className="grid gap-3 px-2.5 pb-2.5 sm:grid-cols-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink-2">
          <dt>Pays from</dt>
          <dd className="text-ink">{wallet ? <Address value={wallet} /> : "Your signed-in wallet"}</dd>
          <dt>Fee</dt>
          <dd className="text-ink">{estimate.percentFeeRaw ? formatToken(String(estimate.percentFeeRaw), mint) : "Not quoted"}</dd>
          <dt>Net delivered</dt>
          <dd className="text-ink">{estimate.netDeliveredRaw ? formatToken(String(estimate.netDeliveredRaw), mint) : "Not quoted"}</dd>
          <dt>SOL up front</dt>
          <dd className="text-ink">{formatSol(typeof estimate.requiredSolUpFrontLamports === "number" ? estimate.requiredSolUpFrontLamports : null)}</dd>
          <dt>Started by</dt>
          <dd className="text-ink">
            {run.trigger.type.replace("trigger.", "")} at {new Date(run.trigger.at).toLocaleString()}
          </dd>
          {typeof hash === "string" && (
            <>
              <dt>Fingerprint</dt>
              <dd className="font-mono text-ink" title="The transfer step refuses to quote anything that doesn't match this.">
                {hash.slice(0, 16)}…
              </dd>
            </>
          )}
        </dl>
        <ul className="max-h-36 overflow-auto rounded border border-line">
          {destinations.map((d, i) => (
            <li key={i} className="flex items-center justify-between gap-2 border-b border-line px-2 py-1 last:border-0">
              <span className="min-w-0 truncate">
                {d.label ? <span className="mr-1 text-ink">{String(d.label)}</span> : null}
                <Address value={String(d.wallet ?? "")} />
              </span>
              <span className="shrink-0 font-semibold text-ink">{formatToken(String(d.amountRaw ?? "0"), mint)}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
