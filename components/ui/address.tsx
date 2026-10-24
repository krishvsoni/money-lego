"use client";

import { useState } from "react";
import { shortAddress } from "@/lib/solana-address";
import { explorerUrl } from "@/lib/tokens";

export function Address({ value, kind = "address", full = false }: { value: string; kind?: "address" | "tx"; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <a
        href={explorerUrl(kind, value)}
        target="_blank"
        rel="noreferrer"
        title={value}
        className="truncate font-mono text-[0.8125rem] text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink"
      >
        {full ? value : shortAddress(value, kind === "tx" ? 6 : 4)}
      </a>
      <button onClick={copy} className="press shrink-0 rounded px-1 text-xs text-ink-3 hover:text-ink" aria-label={`Copy ${kind === "tx" ? "signature" : "address"}`}>
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
