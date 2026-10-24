"use client";

import { useParams } from "next/navigation";
import { Address } from "@/components/ui/address";
import { StatusBadge } from "@/components/ui/status-badge";
import { Wordmark } from "@/components/wordmark";
import type { ReceiptDTO } from "@/lib/dto";
import { formatToken } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { AllocationBar } from "@/features/recipes/allocation-bar";

export function View() {
  const { token } = useParams<{ token: string }>();
  const { data, error } = useResource<{ receipt: ReceiptDTO }>(`/api/receipts/${token}`);

  return (
    <div className="mx-auto w-full max-w-[720px] flex-1 px-4 py-8 sm:px-6">
      <Wordmark />
      {error && <p role="alert" className="mt-10 text-danger">{error}</p>}
      {!data && !error && <div className="mt-10 h-72 animate-pulse rounded-xl bg-sunken" />}
      {data && (() => {
        const r = data.receipt;
        return (
          <article className="mt-10 rounded-xl border border-line bg-surface p-6 sm:p-8">
            <p className="text-sm text-ink-2">Payout receipt</p>
            <h1 className="headline mt-1 text-3xl">{formatToken(r.amountRaw, r.tokenMint)}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink-2">
              <StatusBadge state={r.state} />
              <span>{r.recipeName}</span>
              <span>{new Date(r.createdAt).toLocaleString()}</span>
            </div>
            <div className="mt-8">
              <AllocationBar
                segments={r.destinations.map((d, i) => ({ key: `${i}`, title: d.wallet, amount: BigInt(d.amountRaw) }))}
                label="Split between recipients"
              />
            </div>
            <ul className="mt-5 divide-y divide-line">
              {r.destinations.map((d) => (
                <li key={d.wallet} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <Address value={d.wallet} />
                  <span>
                    <span className="num font-semibold">{formatToken(d.amountRaw, r.tokenMint)}</span>
                    <span className={`ml-3 ${d.status === "paid" ? "text-success" : "text-ink-3"}`}>{d.status === "paid" ? "Paid" : "Pending"}</span>
                  </span>
                </li>
              ))}
            </ul>
            {r.signatures.length > 0 && (
              <div className="mt-6 border-t border-line pt-4">
                <p className="text-sm font-semibold">On-chain transactions</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {r.signatures.map((s) => (
                    <li key={s.signature}>
                      <Address value={s.signature} kind="tx" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-6 text-xs text-ink-3">
              Amounts shown are what MultiHopper reports per recipient once paid; before that, the amounts sent.
              {r.supportBundleId && ` MultiHopper reference ${r.supportBundleId}.`}
            </p>
          </article>
        );
      })()}
    </div>
  );
}
