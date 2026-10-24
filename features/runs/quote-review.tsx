"use client";

import { useEffect, useState } from "react";
import { Address } from "@/components/ui/address";
import { Button } from "@/components/ui/button";
import type { ExecutionDTO } from "@/lib/dto";
import { formatDuration, formatSol, formatToken } from "@/lib/format";
import { AllocationBar, brickColor } from "@/features/recipes/allocation-bar";

function useCountdown(iso: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  return iso ? Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000)) : null;
}

function Line({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5">
      <dt className="text-sm text-ink-2">
        {label}
        {note && <span className="block text-xs text-ink-3">{note}</span>}
      </dt>
      <dd className={`text-right ${strong ? "text-lg font-bold" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}

export function QuoteReview({ run, onSign, signing, onRequote }: { run: ExecutionDTO; onSign: () => void; signing: boolean; onRequote: () => void }) {
  const [checked, setChecked] = useState(false);
  const quote = run.quote;
  const left = useCountdown(quote?.expiresAt ?? null);
  if (!quote) return null;

  const mint = run.config.tokenMint;
  const single = run.config.destinations.length === 1;
  const netFor = (wallet: string) =>
    single ? quote.recipientReceivesRaw : (quote.destinationsNet.find((d) => d.wallet === wallet)?.amountRaw ?? null);
  const expired = left === 0;

  const segments = run.config.destinations.map((d, i) => ({
    key: `${i}`,
    title: d.label || d.wallet,
    amount: BigInt(netFor(d.wallet) ?? d.amountRaw),
  }));

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
      <section>
        <h2 className="text-lg font-bold">Who receives what</h2>
        <p className="mt-1 text-sm text-ink-2">Recipient amounts come from MultiHopper&apos;s quote, after its fee. The striped brick is the fee.</p>
        <div className="mt-5">
          <AllocationBar segments={segments} feeRaw={BigInt(quote.percentFeeRaw)} label="Quoted split after fees" />
        </div>
        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              <th className="pb-2 font-semibold">Recipient</th>
              <th className="pb-2 text-right font-semibold">You send</th>
              <th className="pb-2 text-right font-semibold">They receive</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {run.config.destinations.map((d, i) => {
              const net = netFor(d.wallet);
              return (
                <tr key={d.wallet}>
                  <td className="py-3 pr-3">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: brickColor(i) }} aria-hidden />
                      <span className="min-w-0">
                        {d.label && <span className="block font-semibold">{d.label}</span>}
                        <Address value={d.wallet} />
                      </span>
                    </span>
                  </td>
                  <td className="py-3 text-right text-ink-2">{formatToken(d.amountRaw, mint)}</td>
                  <td className="py-3 text-right font-semibold">{net ? formatToken(net, mint) : "Shown after funding"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-4 text-sm text-ink-2">
          Route: {quote.hops} hops, delivered within {formatDuration(quote.arrivalSeconds)} of funding.
          {quote.isTest && " This is a test-mode quote."}
        </p>
      </section>

      <aside className="h-fit rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-24">
        <h2 className="text-lg font-bold">Before you sign</h2>
        <dl className="mt-3 divide-y divide-line">
          <Line label="You send" value={formatToken(quote.amountRaw, mint)} />
          <Line label="Protocol fee" value={formatToken(quote.percentFeeRaw, mint)} note={quote.percentFeeBps !== null ? `${quote.percentFeeBps / 100}% of the amount` : undefined} />
          <Line label="Recipients receive" value={formatToken(quote.recipientReceivesRaw, mint)} strong />
          <Line label="Hop fees" value={formatSol(quote.totalFlatFeeLamports)} note="Paid in SOL" />
          <Line
            label="SOL needed in your wallet"
            value={formatSol(quote.requiredSolUpFrontLamports)}
            note={quote.refundableLamports ? `${formatSol(quote.refundableLamports)} of it is rent you can reclaim later` : "Covers fees, rent and network costs"}
          />
        </dl>

        <p className={`mt-3 text-sm ${expired ? "text-danger" : "text-ink-2"}`} aria-live="polite">
          {left === null
            ? "MultiHopper didn't return an expiry for this quote."
            : expired
              ? "This quote expired. Get a new one to continue."
              : `Quote valid for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}
        </p>

        {expired ? (
          <Button className="mt-4 w-full" onClick={onRequote}>
            Get a new quote
          </Button>
        ) : (
          <>
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--action)]" />
              <span>I checked every recipient wallet and amount. Sent funds can&apos;t be recalled.</span>
            </label>
            <Button className="mt-4 w-full" disabled={!checked} busy={signing} onClick={onSign}>
              Sign and send {formatToken(quote.amountRaw, mint, 2)}
            </Button>
            <p className="mt-3 text-xs text-ink-3">Your wallet asks for at most two approvals: one to fund the route, one to set it up.</p>
          </>
        )}
      </aside>
    </div>
  );
}
