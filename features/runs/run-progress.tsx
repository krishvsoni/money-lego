"use client";

import { Address } from "@/components/ui/address";
import type { ExecutionDTO } from "@/lib/dto";
import { STATE_META } from "@/lib/execution-states";
import { formatToken, relativeTime } from "@/lib/format";
import { brickColor } from "@/features/recipes/allocation-bar";

const SIGNATURE_LABEL: Record<string, string> = {
  keeper_funding: "Funding",
  route_init: "Route setup",
  orchestrator_init: "Orchestrator setup",
  session_init: "Session setup",
  dispersion_init: "Recipient binding",
};

export function HopProgress({ run }: { run: ExecutionDTO }) {
  if (!run.progress || run.progress.hopsTotal === 0) return null;
  const { hopsCompleted, hopsTotal } = run.progress;
  return (
    <div>
      <p className="text-sm text-ink-2">
        {hopsCompleted} of {hopsTotal} hops complete
      </p>
      <div className="mt-2 flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={hopsTotal} aria-valuenow={hopsCompleted}>
        {Array.from({ length: hopsTotal }, (_, i) => (
          <span
            key={i}
            className="h-2.5 flex-1 rounded-sm"
            style={{ background: i < hopsCompleted ? "var(--action)" : "var(--sunken)", transition: "background-color 300ms ease" }}
          />
        ))}
      </div>
    </div>
  );
}

// Per-recipient outcomes. Only provider-reported payouts show as paid, with the signature.
export function RecipientOutcomes({ run }: { run: ExecutionDTO }) {
  const mint = run.config.tokenMint;
  const outcome = (wallet: string) => run.destinations.find((d) => d.wallet === wallet);
  return (
    <ul className="divide-y divide-line">
      {run.config.destinations.map((d, i) => {
        const o = outcome(d.wallet);
        const paid = o?.status === "paid" || (run.state === "completed" && run.config.destinations.length === 1);
        return (
          <li key={d.wallet} className="grid grid-cols-[12px_1fr_auto] items-center gap-3 py-3">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: brickColor(i) }} aria-hidden />
            <span className="min-w-0">
              {d.label && <span className="mr-2 text-sm font-semibold">{d.label}</span>}
              <Address value={d.wallet} />
              {o?.payoutSignature && (
                <span className="mt-0.5 block text-xs text-ink-3">
                  Payout <Address value={o.payoutSignature} kind="tx" />
                </span>
              )}
            </span>
            <span className="text-right text-sm">
              <span className="num block font-semibold">{formatToken(o?.amountRaw ?? d.amountRaw, mint)}</span>
              <span className={paid ? "text-success" : "text-ink-3"}>{paid ? "Paid" : "Pending"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function Timeline({ run }: { run: ExecutionDTO }) {
  const events = [...run.timeline].reverse();
  return (
    <ol className="relative flex flex-col gap-4 border-l border-line pl-5">
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} className={i === 0 ? "reveal" : undefined}>
          <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper" style={{ background: i === 0 ? "var(--action)" : "var(--line-strong)" }} aria-hidden />
          <p className="text-sm font-semibold">{STATE_META[e.state].label}</p>
          {e.note && <p className="text-sm text-ink-2">{e.note}</p>}
          <p className="text-xs text-ink-3">{relativeTime(e.at)}</p>
        </li>
      ))}
    </ol>
  );
}

export function SignatureList({ run }: { run: ExecutionDTO }) {
  if (!run.signatures.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {run.signatures.map((s) => (
        <li key={s.signature} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-ink-2">
            {SIGNATURE_LABEL[s.kind] ?? s.kind}
            {s.kind !== "keeper_funding" && s.kind !== "orchestrator_init" ? ` ${s.index + 1}` : ""}
          </span>
          <Address value={s.signature} kind="tx" />
        </li>
      ))}
    </ul>
  );
}
