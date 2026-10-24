"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ExecutionDTO } from "@/lib/dto";
import { formatToken, relativeTime } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

export default function TransfersPage() {
  const { data, error } = useResource<{ runs: ExecutionDTO[] }>("/api/runs");
  return (
    <div>
      <h1 className="headline text-3xl">Transfers</h1>
      <p className="mt-2 text-ink-2">Every MultiHopper transfer your workflows created, newest first.</p>
      {error && <p role="alert" className="mt-6 text-danger">{error}</p>}
      <ul className="-mx-3 mt-6 divide-y divide-line">
        {data?.runs.map((r) => (
          <li key={r.id}>
            <Link href={`/runs/${r.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-lg px-3 py-3 hover:bg-surface sm:grid-cols-[1fr_180px_170px_110px]">
              <span className="truncate font-semibold">{r.recipeName}</span>
              <span className="num text-sm text-ink-2">{formatToken(r.amountRaw, r.config.tokenMint, 2)}</span>
              <span><StatusBadge state={r.state} /></span>
              <span className="text-sm text-ink-3 sm:text-right">{relativeTime(r.createdAt)}</span>
            </Link>
          </li>
        ))}
        {data && data.runs.length === 0 && <li className="px-3 py-6 text-sm text-ink-2">No transfers yet. They appear when a workflow reaches MultiHopper create transfer.</li>}
      </ul>
    </div>
  );
}
